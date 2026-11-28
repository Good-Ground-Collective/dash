import { describe, expect, it } from 'vitest';

import { SharedFixtures } from '#src/messages/__tests__/support/shared-fixtures.js';
import { messageRegistry, type RegisteredMessage } from '#src/registry.js';

/** The checks every message shares: it is in the registry, and Zod and the JSON Schema agree on each shared fixture. */
export class MessageContract {
  static async describe(definition: RegisteredMessage): Promise<void> {
    const fixtures = await SharedFixtures.load(definition);
    const validateFixture = await SharedFixtures.compileJsonSchema(definition);

    describe(`${definition.kind} contract`, () => {
      it(`is listed in the registry at ${definition.version}`, () => {
        expect(messageRegistry).toContain(definition);
        expect(definition.version).toMatch(/^\d+\.\d+$/);
      });

      it('has a valid and an invalid shared fixture', () => {
        expect(fixtures.some((fixture) => fixture.valid)).toBe(true);
        expect(fixtures.some((fixture) => !fixture.valid)).toBe(true);
      });

      it.each(fixtures)(
        '$file gets the same verdict from Zod and the JSON Schema',
        ({ valid, message }) => {
          expect(definition.schema.safeParse(message).success).toBe(valid);
          expect(validateFixture(message)).toBe(valid);
        },
      );
    });
  }
}
