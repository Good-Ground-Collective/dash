import { describe, expect, it } from 'vitest';

import { MessageContract } from '#src/messages/__tests__/support/message-contract.js';
import { benchCommandResult } from '#src/messages/bench-command-result.js';

await MessageContract.describe(benchCommandResult);

const result = {
  schemaVersion: '1.0',
  kind: 'bench.command-result',
  id: '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f',
  emittedAt: '2026-11-27T09:30:00Z',
  payload: {
    commandId: 'cmd-0001',
    harnessId: 'claude-code',
    exitStatus: 0,
    outputTail: 'changed 1 package in 4s',
  },
};

describe('benchCommandResult length limits', () => {
  it('accepts an outputTail of 4000 characters and rejects one more', () => {
    const withOutputTail = (length: number) => ({
      ...result,
      payload: { ...result.payload, outputTail: 'x'.repeat(length) },
    });

    expect(
      benchCommandResult.schema.safeParse(withOutputTail(4000)).success,
    ).toBe(true);
    expect(
      benchCommandResult.schema.safeParse(withOutputTail(4001)).success,
    ).toBe(false);
  });
});
