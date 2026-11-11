/**
 * 报考流程时间节点 → 日历关键节点（2026-11-12）
 *
 * 回归背景：报考信息原先只存考试日，报名/缴费/准考证这些截止节点全靠人记，
 * 错过就白准备。现在把它们存进 `ExamRegistration.timeline`，
 * 由 `collectExamTargets` 一并产出，日历/时间线共用同一份口径。
 */
import { describe, expect, it } from 'vitest';
import { collectExamTargets } from '../src/services/planner';
import { REGISTRATION_TIMELINE_LABEL, type ExamRegistration } from '../src/domain/types';

function reg(over: Partial<ExamRegistration>): ExamRegistration {
  return {
    id: 'r1',
    postName: '南沙发改局 · 一级科员',
    examType: 'national',
    examDate: '2026-11-29',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

describe('报考流程节点接入日历', () => {
  it('timeline 的每个非空节点都会生成日历节点', () => {
    const targets = collectExamTargets([
      reg({
        subjectPlans: { xingce: { examDate: '2026-11-29' } },
        timeline: {
          registerStart: '2026-10-15',
          registerEnd: '2026-10-24',
          paymentStart: '2026-11-14',
          paymentEnd: '2026-11-16',
          admissionTicketStart: '2026-11-23',
        },
      }),
    ]);
    const dates = targets.map((t) => t.date);
    expect(dates).toContain('2026-10-15');
    expect(dates).toContain('2026-10-24');
    expect(dates).toContain('2026-11-14');
    expect(dates).toContain('2026-11-16');
    expect(dates).toContain('2026-11-23');
    expect(dates).toContain('2026-11-29');
    // 升序
    expect([...dates].sort()).toEqual(dates);
  });

  it('节点标签带上岗位名与节点名', () => {
    const targets = collectExamTargets([
      reg({ timeline: { registerEnd: '2026-10-24' }, subjectPlans: {} }),
    ]);
    const hit = targets.find((t) => t.date === '2026-10-24');
    expect(hit?.label).toContain('南沙发改局');
    expect(hit?.label).toContain('报名截止');
  });

  it('未填 timeline 时行为与改动前一致（只有考试日）', () => {
    const targets = collectExamTargets([
      reg({ examDate: '2026-11-29', subjectPlans: {} }),
    ]);
    expect(targets.map((t) => t.date)).toEqual(['2026-11-29']);
  });

  it('同一天多个节点会合并成一条，不重复占多行', () => {
    const targets = collectExamTargets([
      reg({
        subjectPlans: {},
        timeline: { registerStart: '2026-10-15', registerEnd: '2026-10-15' },
      }),
    ]);
    const same = targets.filter((t) => t.date === '2026-10-15');
    expect(same).toHaveLength(1);
    expect(same[0].label).toContain('报名开始');
    expect(same[0].label).toContain('报名截止');
  });

  it('from 过滤对流程节点同样生效', () => {
    const targets = collectExamTargets(
      [reg({ timeline: { registerEnd: '2026-10-24' }, subjectPlans: {} })],
      '2026-11-01',
    );
    expect(targets.map((t) => t.date)).not.toContain('2026-10-24');
  });

  it('声明表覆盖六个节点且截止项有标记', () => {
    expect(REGISTRATION_TIMELINE_LABEL).toHaveLength(6);
    const deadlines = REGISTRATION_TIMELINE_LABEL.filter((x) => x.isDeadline).map((x) => x.key);
    expect(deadlines).toEqual(['registerEnd', 'paymentEnd']);
  });
});
