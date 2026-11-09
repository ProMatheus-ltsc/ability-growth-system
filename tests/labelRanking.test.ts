import { describe, expect, it } from 'vitest';
import { buildLabelStats, selectValidLabelStats } from '../src/services/analytics';
import type { LabelStat } from '../src/domain/types';

function leaf(over: Partial<LabelStat> & Pick<LabelStat, 'id' | 'path'>): LabelStat {
  const path = over.path;
  return {
    subject: 'xingce',
    levels: { l1: path[0] },
    depth: path.length,
    labelSource: 'official',
    questionCount: 10,
    correctCount: 6,
    rate: 60,
    uniqueQuestionCount: 5,
    multiLabelCount: 0,
    updatedAt: '2026-11-01',
    ...over,
  };
}

describe('题型排名 · labelStats 口径与向上卷', () => {
  it('剔除 duplicate 与 derived 行，缺省字段视为正常行', () => {
    const leaves = [
      leaf({ id: 'ok', path: ['资料分析', '增长率'] }),
      leaf({ id: 'dup', path: ['资料分析', '比重'], validity: 'duplicate' }),
      leaf({ id: 'dev', path: ['资料分析', '平均数'], aggregationRole: 'derived' }),
      leaf({ id: 'normal-aggr', path: ['资料分析', '倍数'], aggregationRole: 'module_detail' }),
    ];
    const valid = selectValidLabelStats(leaves);
    expect(valid.map((l) => l.id)).toEqual(['ok', 'normal-aggr']);
  });

  it('空输入返回空树，不报错', () => {
    expect(buildLabelStats([])).toEqual([]);
    expect(buildLabelStats([leaf({ id: 'no-path', path: [] })])).toEqual([]);
  });

  it('按路径前缀向上卷，父级计数等于子级之和', () => {
    const leaves = [
      leaf({ id: 'a', path: ['资料分析', '增长率', '基期量'], questionCount: 10, correctCount: 4, uniqueQuestionCount: 5 }),
      leaf({ id: 'b', path: ['资料分析', '增长率', '现期量'], questionCount: 20, correctCount: 14, uniqueQuestionCount: 9 }),
    ];
    const [root] = buildLabelStats(leaves);
    expect(root.path).toEqual(['资料分析']);
    expect(root.questionCount).toBe(30);
    expect(root.uniqueQuestionCount).toBe(14);
    expect(root.correctCount).toBe(18);
    expect(root.rate).toBe(60);
    expect(root.children).toHaveLength(1);
    const l2 = root.children[0];
    expect(l2.path).toEqual(['资料分析', '增长率']);
    expect(l2.children.map((c) => c.path.join('>')).sort()).toEqual([
      '资料分析>增长率>基期量',
      '资料分析>增长率>现期量',
    ]);
  });

  it('排序为正确率从低到高，同分时样本大的在前', () => {
    const leaves = [
      leaf({ id: 'strong', path: ['A'], questionCount: 10, correctCount: 9 }),
      leaf({ id: 'weak-small', path: ['B'], questionCount: 6, correctCount: 2 }),
      leaf({ id: 'weak-large', path: ['C'], questionCount: 40, correctCount: 0 }),
      leaf({ id: 'mid', path: ['D'], questionCount: 20, correctCount: 10 }),
    ];
    const roots = buildLabelStats(leaves);
    // B/C 都是 0%，样本更大的 C 排在前面
    expect(roots.map((n) => n.path[0])).toEqual(['C', 'B', 'D', 'A']);
  });

  it('只有 1 道题的叶子保持 0% / 100%，不产生中间值', () => {
    const roots = buildLabelStats([
      leaf({ id: 'one-right', path: ['甲'], questionCount: 1, correctCount: 1, uniqueQuestionCount: 1 }),
      leaf({ id: 'one-wrong', path: ['乙'], questionCount: 1, correctCount: 0, uniqueQuestionCount: 1 }),
    ]);
    expect(roots).toHaveLength(2);
    const rates = roots.map((n) => n.rate).sort((a, b) => a - b);
    expect(rates).toEqual([0, 100]);
  });

  it('并列多标签次数逐级向上汇总', () => {
    const leaves = [
      leaf({ id: 'x', path: ['言语', '逻辑填空', '搭配对象'], questionCount: 176, correctCount: 88, multiLabelCount: 176 }),
      leaf({ id: 'y', path: ['言语', '逻辑填空', '语境'], questionCount: 24, correctCount: 12, multiLabelCount: 4 }),
    ];
    const [root] = buildLabelStats(leaves);
    expect(root.multiLabelCount).toBe(180);
    expect(root.questionCount).toBe(200);
    const l2 = root.children[0];
    expect(l2.multiLabelCount).toBe(180);
  });

  it('来源在叶子计数、父级汇总为 official / inferred / mixed', () => {
    const leaves = [
      leaf({ id: 'o', path: ['判断', '图形', '对称'], labelSource: 'official' }),
      leaf({ id: 'i', path: ['判断', '图形', '折叠'], labelSource: 'inferred', labelBasis: '解析提到折叠' }),
    ];
    const mixedRoot = buildLabelStats(leaves)[0];
    expect(mixedRoot.officialLeaves).toBe(1);
    expect(mixedRoot.inferredLeaves).toBe(1);
    expect(mixedRoot.labelSource).toBe('mixed');
    expect(mixedRoot.children[0].labelSource).toBe('mixed');
    expect(mixedRoot.children[0].children.map((c) => c.labelSource).sort()).toEqual(['inferred', 'official']);

    const onlyOfficial = buildLabelStats([leaves[0]])[0];
    expect(onlyOfficial.labelSource).toBe('official');
    const onlyInferred = buildLabelStats([leaves[1]])[0];
    expect(onlyInferred.labelSource).toBe('inferred');
  });
});
