import { describe, expect, it } from 'vitest';

import { examplePing } from '#src/messages/example.js';

const ping = {
  schemaVersion: '1.0',
  kind: 'example.ping',
  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  emittedAt: '2026-11-27T09:30:00Z',
  payload: { text: 'hello' },
};

describe('examplePing', () => {
  it('parses a valid example.ping', () => {
    expect(examplePing.schema.parse(ping)).toEqual(ping);
  });

  it('rejects a message without schemaVersion', () => {
    const { schemaVersion: _omitted, ...withoutVersion } = ping;

    expect(examplePing.schema.safeParse(withoutVersion).success).toBe(false);
  });

  it('drops unknown fields instead of rejecting them', () => {
    const parsed = examplePing.schema.parse({
      ...ping,
      sender: 'bench-1',
      payload: { ...ping.payload, priority: 'high' },
    });

    expect(parsed).toEqual(ping);
  });

  it('accepts a newer minor version of a known major', () => {
    expect(
      examplePing.schema.safeParse({ ...ping, schemaVersion: '1.7' }).success,
    ).toBe(true);
  });

  it('rejects an unknown major version', () => {
    expect(
      examplePing.schema.safeParse({ ...ping, schemaVersion: '2.0' }).success,
    ).toBe(false);
  });
});
