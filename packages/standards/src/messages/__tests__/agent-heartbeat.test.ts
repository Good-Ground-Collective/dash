import { describe, expect, it } from 'vitest';

import { SharedFixtures } from '#src/messages/__tests__/support/shared-fixtures.js';
import {
  agentHeartbeat,
  agentHeartbeatStatuses,
} from '#src/messages/agent-heartbeat.js';
import { messageRegistry } from '#src/registry.js';

const heartbeat = {
  schemaVersion: '1.0',
  kind: 'agent.heartbeat',
  id: '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f',
  emittedAt: '2026-11-27T09:30:00Z',
  payload: {
    sessionId: '3b7e9f20-5c4a-4d1e-8a6b-2f9c0d1e3a4b',
    seq: 0,
    harness: 'claude-code',
    status: 'working',
  },
};

describe('agentHeartbeat', () => {
  it('is listed in the registry at 1.0', () => {
    expect(messageRegistry).toContain(agentHeartbeat);
    expect(agentHeartbeat.version).toBe('1.0');
  });

  it.each(agentHeartbeatStatuses)('parses a %s heartbeat', (status) => {
    const message = { ...heartbeat, payload: { ...heartbeat.payload, status } };

    expect(agentHeartbeat.schema.parse(message)).toEqual(message);
  });

  it('parses a subagent heartbeat that shares its parent session', () => {
    const message = {
      ...heartbeat,
      payload: {
        ...heartbeat.payload,
        agentId: 'a1b2c3d4',
        agent: { type: 'code-reviewer', model: 'claude-sonnet-4-5' },
      },
    };

    expect(agentHeartbeat.schema.parse(message)).toEqual(message);
  });

  it('parses a question heartbeat with its options', () => {
    const message = {
      ...heartbeat,
      payload: {
        ...heartbeat.payload,
        status: 'question',
        question: {
          text: 'Which branch should the fix go on?',
          options: [
            { label: 'main', description: 'Ship it in the next release' },
            { label: 'release/1.2' },
          ],
        },
      },
    };

    expect(agentHeartbeat.schema.parse(message)).toEqual(message);
  });

  it('strips a usage field the schema does not define', () => {
    const parsed = agentHeartbeat.schema.parse({
      ...heartbeat,
      payload: { ...heartbeat.payload, usage: { inputTokens: 1200 } },
    });

    expect(parsed).toEqual(heartbeat);
  });
});

describe('agentHeartbeat constraints', () => {
  it('accepts a harness it does not know and rejects one that is not lowercase', () => {
    const withHarness = (harness: string) => ({
      ...heartbeat,
      payload: { ...heartbeat.payload, harness },
    });

    expect(
      agentHeartbeat.schema.safeParse(withHarness('example-harness.cli'))
        .success,
    ).toBe(true);
    expect(
      agentHeartbeat.schema.safeParse(withHarness('Claude Code')).success,
    ).toBe(false);
  });

  it('accepts a 64-character harness and rejects a 65-character one', () => {
    const withHarness = (harness: string) => ({
      ...heartbeat,
      payload: { ...heartbeat.payload, harness },
    });

    expect(
      agentHeartbeat.schema.safeParse(withHarness('h'.repeat(64))).success,
    ).toBe(true);
    expect(
      agentHeartbeat.schema.safeParse(withHarness('h'.repeat(65))).success,
    ).toBe(false);
  });
});

describe('agentHeartbeat length limits', () => {
  it.each([
    {
      field: 'summary',
      limit: 500,
      payload: (text: string) => ({ summary: text }),
    },
    {
      field: 'question.text',
      limit: 2000,
      payload: (text: string) => ({ question: { text } }),
    },
    {
      field: 'question.options[].label',
      limit: 200,
      payload: (text: string) => ({
        question: { text: 'Which?', options: [{ label: text }] },
      }),
    },
    {
      field: 'error.message',
      limit: 2000,
      payload: (text: string) => ({ error: { kind: 'api', message: text } }),
    },
  ])(
    'accepts $field at $limit characters and rejects one more',
    ({ limit, payload }) => {
      const withText = (length: number) => ({
        ...heartbeat,
        payload: { ...heartbeat.payload, ...payload('x'.repeat(length)) },
      });

      expect(agentHeartbeat.schema.safeParse(withText(limit)).success).toBe(
        true,
      );
      expect(agentHeartbeat.schema.safeParse(withText(limit + 1)).success).toBe(
        false,
      );
    },
  );

  it('rejects an empty summary', () => {
    expect(
      agentHeartbeat.schema.safeParse({
        ...heartbeat,
        payload: { ...heartbeat.payload, summary: '' },
      }).success,
    ).toBe(false);
  });
});

describe('agentHeartbeat seq', () => {
  it('rejects a negative or fractional seq', () => {
    for (const seq of [-1, 1.5]) {
      expect(
        agentHeartbeat.schema.safeParse({
          ...heartbeat,
          payload: { ...heartbeat.payload, seq },
        }).success,
      ).toBe(false);
    }
  });
});

const fixtures = await SharedFixtures.load(agentHeartbeat);
const validateFixture = await SharedFixtures.compileJsonSchema(agentHeartbeat);

describe('the shared agent.heartbeat fixtures', () => {
  it('include a valid heartbeat for every status', () => {
    const statuses = new Set(
      fixtures
        .filter((fixture) => fixture.valid)
        .map(
          (fixture) =>
            agentHeartbeat.schema.parse(fixture.message).payload.status,
        ),
    );

    expect([...statuses].sort()).toEqual([...agentHeartbeatStatuses].sort());
  });

  it('include invalid messages', () => {
    expect(fixtures.some((fixture) => !fixture.valid)).toBe(true);
  });

  it.each(fixtures)(
    '$file gets the same verdict from Zod and the JSON Schema',
    ({ valid, message }) => {
      expect(agentHeartbeat.schema.safeParse(message).success).toBe(valid);
      expect(validateFixture(message)).toBe(valid);
    },
  );
});
