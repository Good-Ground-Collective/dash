import { describe, expect, it } from 'vitest';

import { MessageContract } from '#src/messages/__tests__/support/message-contract.js';
import { benchMetrics } from '#src/messages/bench-metrics.js';

await MessageContract.describe(benchMetrics);

const sample = {
  schemaVersion: '1.0',
  kind: 'bench.metrics',
  id: '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f',
  emittedAt: '2026-11-27T09:30:00Z',
  payload: {
    sampledAt: '2026-11-27T09:29:30Z',
    cpuPercent: 12.5,
    memory: { usedBytes: 21474836480, totalBytes: 68719476736 },
    disks: [
      { volume: '/', usedBytes: 214748364800, totalBytes: 1000204886016 },
    ],
    network: { bytesIn: 48213, bytesOut: 9120 },
  },
};

describe('benchMetrics limits', () => {
  it('accepts a cpuPercent of exactly 100 and rejects 100.1', () => {
    const withCpuPercent = (cpuPercent: number) => ({
      ...sample,
      payload: { ...sample.payload, cpuPercent },
    });

    expect(benchMetrics.schema.safeParse(withCpuPercent(100)).success).toBe(
      true,
    );
    expect(benchMetrics.schema.safeParse(withCpuPercent(100.1)).success).toBe(
      false,
    );
  });
});
