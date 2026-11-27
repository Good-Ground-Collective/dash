import { readdir, readFile } from 'node:fs/promises';

import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { z } from 'zod';

import type { RegisteredMessage } from '#src/registry.js';

export type SharedFixture = {
  file: string;
  valid: boolean;
  message: unknown;
};

/** Reads `fixtures/<kind>.v<major>/`, the JSON messages the Zod tests and the Go tests both parse. */
export class SharedFixtures {
  static readonly FIXTURES_DIRECTORY = new URL(
    '../../../../fixtures/',
    import.meta.url,
  );

  static readonly SCHEMAS_DIRECTORY = new URL(
    '../../../../schemas/',
    import.meta.url,
  );

  static fileStem(definition: RegisteredMessage): string {
    const major = definition.version.slice(0, definition.version.indexOf('.'));

    return `${definition.kind}.v${major}`;
  }

  static async load(definition: RegisteredMessage): Promise<SharedFixture[]> {
    const fixtures: SharedFixture[] = [];
    for (const valid of [true, false]) {
      const directory = new URL(
        `${SharedFixtures.fileStem(definition)}/${valid ? 'valid' : 'invalid'}/`,
        SharedFixtures.FIXTURES_DIRECTORY,
      );
      for (const file of (await readdir(directory)).sort()) {
        if (file.endsWith('.json')) {
          fixtures.push({
            file: `${valid ? 'valid' : 'invalid'}/${file}`,
            valid,
            message: z
              .unknown()
              .parse(
                JSON.parse(await readFile(new URL(file, directory), 'utf8')),
              ),
          });
        }
      }
    }

    return fixtures;
  }

  /** Compiles the generated JSON Schema for a message, so tests can hold it to the same fixtures as Zod. */
  static async compileJsonSchema(
    definition: RegisteredMessage,
  ): Promise<ValidateFunction> {
    const ajv = new Ajv2020({ strict: true });
    addFormats.default(ajv);

    return ajv.compile(
      z
        .record(z.string(), z.unknown())
        .parse(
          JSON.parse(
            await readFile(
              new URL(
                `${SharedFixtures.fileStem(definition)}.json`,
                SharedFixtures.SCHEMAS_DIRECTORY,
              ),
              'utf8',
            ),
          ),
        ),
    );
  }
}
