import { describe, expect, it } from 'vitest';

import { MessageContract } from '#src/messages/__tests__/support/message-contract.js';
import { benchHarnesses } from '#src/messages/bench-harnesses.js';

await MessageContract.describe(benchHarnesses);

describe('benchHarnesses length limits', () => {
  it('accepts a 64-character harness id and rejects a 65-character one', () => {
    const withHarnessId = (length: number) => ({
      schemaVersion: '1.0',
      kind: 'bench.harnesses',
      id: '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f',
      emittedAt: '2026-11-27T09:30:00Z',
      payload: { harnesses: [{ id: 'h'.repeat(length), version: '2.1.0' }] },
    });

    expect(benchHarnesses.schema.safeParse(withHarnessId(64)).success).toBe(
      true,
    );
    expect(benchHarnesses.schema.safeParse(withHarnessId(65)).success).toBe(
      false,
    );
  });
});
