import { describe, expect, it } from 'vitest';

import { MessageContract } from '#src/messages/__tests__/support/message-contract.js';
import { SharedFixtures } from '#src/messages/__tests__/support/shared-fixtures.js';
import { benchCommand } from '#src/messages/bench-command.js';

await MessageContract.describe(benchCommand);
const validateJsonSchema = await SharedFixtures.compileJsonSchema(benchCommand);

const envelope = {
  schemaVersion: '1.0',
  kind: 'bench.command',
  id: '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f',
  emittedAt: '2026-11-27T09:30:00Z',
};

describe('benchCommand', () => {
  it('parses a request that names a harness by its allowlist id', () => {
    const message = {
      ...envelope,
      payload: { commandId: 'cmd-1', harnessId: 'claude-code' },
    };

    expect(benchCommand.schema.parse(message)).toEqual(message);
  });

  it('fails to parse a request that carries a command string, in Zod and in the JSON Schema', () => {
    const message = {
      ...envelope,
      payload: {
        commandId: 'cmd-1',
        harnessId: 'claude-code',
        command: 'rm -rf /',
      },
    };

    expect(benchCommand.schema.safeParse(message).success).toBe(false);
    expect(validateJsonSchema(message)).toBe(false);
  });
});
