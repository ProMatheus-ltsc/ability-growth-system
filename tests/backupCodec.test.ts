import { describe, expect, it } from 'vitest';
import { decodeBackupPayload, encodeBackupPayload } from '../functions/api/[[path]]';

const snapshot = {
  version: '2.2.0',
  trainings: Array.from({ length: 200 }, (_, index) => ({
    id: `train-${index}`,
    note: '粉笔同步｜2026 国考行政执法卷模考复盘',
    totalQuestions: 130,
    errorCount: index % 40,
  })),
  exams: [],
};

describe('备份载荷压缩', () => {
  it('编码后带 gz 前缀，且明显小于明文 JSON', async () => {
    const encoded = await encodeBackupPayload(snapshot);
    const plain = JSON.stringify(snapshot);
    expect(encoded.startsWith('gz:')).toBe(true);
    expect(encoded.length).toBeLessThan(plain.length / 2);
  });

  it('编码/解码往返保持数据一致', async () => {
    const encoded = await encodeBackupPayload(snapshot);
    expect(await decodeBackupPayload(encoded)).toEqual(snapshot);
  });

  it('兼容历史明文 JSON 备份', async () => {
    expect(await decodeBackupPayload(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
