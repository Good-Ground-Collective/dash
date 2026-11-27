import { readFile } from 'node:fs/promises';

import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { SharedFixtures } from '#src/messages/__tests__/support/shared-fixtures.js';
import { examplePing } from '#src/messages/example.js';

const ping = {
  schemaVersion: '1.0',
  kind: 'example.ping',
  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  emittedAt: '2026-11-27T09:30:00Z',
  payload: { text: 'hello' },
};

const jsonSchema = z
  .record(z.string(), z.unknown())
  .parse(
    JSON.parse(
      await readFile(
        new URL('../../../schemas/example.ping.v1.json', import.meta.url),
        'utf8',
      ),
    ),
  );

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

describe('the generated example.ping JSON Schema', () => {
  const ajv = new Ajv2020({ strict: true });
  addFormats.default(ajv);
  const validate = ajv.compile(jsonSchema);

  it('accepts the fixture the Zod schema accepts', () => {
    expect(validate(ping)).toBe(true);
  });

  it('accepts unknown fields', () => {
    expect(
      validate({
        ...ping,
        sender: 'bench-1',
        payload: { ...ping.payload, priority: 'high' },
      }),
    ).toBe(true);
  });

  it('accepts a newer minor version and rejects an unknown major', () => {
    expect(validate({ ...ping, schemaVersion: '1.7' })).toBe(true);
    expect(validate({ ...ping, schemaVersion: '2.0' })).toBe(false);
  });

  it('rejects a message without schemaVersion', () => {
    const { schemaVersion: _omitted, ...withoutVersion } = ping;

    expect(validate(withoutVersion)).toBe(false);
  });
});

const fixtures = await SharedFixtures.load(examplePing);
const validateFixture = await SharedFixtures.compileJsonSchema(examplePing);

describe('the shared example.ping fixtures', () => {
  it('include valid and invalid messages', () => {
    expect(fixtures.some((fixture) => fixture.valid)).toBe(true);
    expect(fixtures.some((fixture) => !fixture.valid)).toBe(true);
  });

  it.each(fixtures)(
    '$file gets the same verdict from Zod and the JSON Schema',
    ({ valid, message }) => {
      expect(examplePing.schema.safeParse(message).success).toBe(valid);
      expect(validateFixture(message)).toBe(valid);
    },
  );
});
