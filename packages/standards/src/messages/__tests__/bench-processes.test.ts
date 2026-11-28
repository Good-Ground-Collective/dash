import { describe, expect, it } from 'vitest';

import { MessageContract } from '#src/messages/__tests__/support/message-contract.js';
import { benchProcesses } from '#src/messages/bench-processes.js';

await MessageContract.describe(benchProcesses);

describe('benchProcesses', () => {
  it('drops process ids and command lines it does not define', () => {
    const parsed = benchProcesses.schema.parse({
      schemaVersion: '1.0',
      kind: 'bench.processes',
      id: '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f',
      emittedAt: '2026-11-27T09:30:00Z',
      payload: {
        processes: [
          {
            name: 'claude',
            running: true,
            instances: 1,
            cpuPercent: 1,
            memoryBytes: 1,
            pid: 42,
            commandLine: 'claude --token=secret',
          },
        ],
      },
    });

    expect(parsed.payload.processes[0]).toEqual({
      name: 'claude',
      running: true,
      instances: 1,
      cpuPercent: 1,
      memoryBytes: 1,
    });
  });
});
