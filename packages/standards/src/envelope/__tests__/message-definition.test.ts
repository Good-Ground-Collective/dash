import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';

const payload = z.object({});

describe('MessageDefinition', () => {
  it('pins schemaVersion to the major of its version', () => {
    const { schema } = new MessageDefinition({
      kind: 'bench.status',
      version: '12.3',
      payload,
    });
    const readsVersion = (schemaVersion: string) =>
      schema.safeParse({
        schemaVersion,
        kind: 'bench.status',
        id: '0f8fad5b-d9cb-469f-a165-70867728950e',
        emittedAt: '2026-11-27T09:30:00Z',
        payload: {},
      }).success;

    expect(readsVersion('12.0')).toBe(true);
    expect(readsVersion('1.0')).toBe(false);
    expect(readsVersion('120.0')).toBe(false);
  });

  it('refuses a kind that is not a dotted name', () => {
    expect(
      () => new MessageDefinition({ kind: 'ping', version: '1.0', payload }),
    ).toThrow();
  });

  it('refuses a version that is not major.minor', () => {
    expect(
      () =>
        new MessageDefinition({ kind: 'example.ping', version: '1', payload }),
    ).toThrow();
  });
});
