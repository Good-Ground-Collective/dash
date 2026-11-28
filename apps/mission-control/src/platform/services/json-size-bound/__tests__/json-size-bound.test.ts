import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { UnboundedJsonSchemaError } from '#src/platform/errors.ts';
import { JsonSizeBound } from '#src/platform/services/json-size-bound/json-size-bound.ts';

const control = '\u0001';

describe('JsonSizeBound.maxBytes', () => {
  it('answers the size of the largest document, with every string escaped at its worst', () => {
    const schema = z.object({
      name: z.string().max(3),
      tags: z.array(z.string().max(2)).max(2),
      count: z.int(),
      enabled: z.boolean(),
      kind: z.literal('note'),
      level: z.enum(['low', 'highest']),
      note: z.string().max(4).optional(),
    });
    const largest = {
      name: control.repeat(3),
      tags: [control.repeat(2), control.repeat(2)],
      count: -1.7976931348623157e308,
      enabled: false,
      kind: 'note',
      level: 'highest',
      note: control.repeat(4),
    };

    expect(JsonSizeBound.maxBytes(schema)).toBe(
      Buffer.byteLength(JSON.stringify(largest)),
    );
  });

  it('answers the larger branch of a union or a nullable field', () => {
    const schema = z.object({
      value: z.union([z.string().max(10), z.string().max(2)]).nullable(),
    });

    expect(JsonSizeBound.maxBytes(schema)).toBe(
      Buffer.byteLength(JSON.stringify({ value: control.repeat(10) })),
    );
  });

  it.each([
    ['an array without maxItems', z.object({ tags: z.array(z.string()) })],
    ['an object open to any key', z.record(z.string(), z.string())],
    ['a field that accepts anything', z.object({ value: z.unknown() })],
  ])('refuses %s', (_label, schema) => {
    expect(() => JsonSizeBound.maxBytes(schema)).toThrow(
      UnboundedJsonSchemaError,
    );
  });
});
