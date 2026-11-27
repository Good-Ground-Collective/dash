import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';
import { z } from 'zod';

import { messageRegistry, type RegisteredMessage } from '#src/registry.js';

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Writes `schemas/<kind>.v<major>.json` for every message in the registry, replacing what was there. */
class JsonSchemaGenerator {
  static readonly OUTPUT_DIRECTORY = fileURLToPath(
    new URL('../schemas', import.meta.url),
  );

  static async writeAll(): Promise<void> {
    const files = new Map<string, string>();
    for (const definition of messageRegistry) {
      files.set(
        JsonSchemaGenerator.fileName(definition),
        await JsonSchemaGenerator.render(definition),
      );
    }

    await mkdir(JsonSchemaGenerator.OUTPUT_DIRECTORY, { recursive: true });
    for (const stale of await readdir(JsonSchemaGenerator.OUTPUT_DIRECTORY)) {
      if (!files.has(stale)) {
        await rm(path.join(JsonSchemaGenerator.OUTPUT_DIRECTORY, stale));
      }
    }

    for (const [name, contents] of files) {
      await writeFile(
        path.join(JsonSchemaGenerator.OUTPUT_DIRECTORY, name),
        contents,
      );
    }
  }

  static fileName(definition: RegisteredMessage): string {
    const major = definition.version.slice(0, definition.version.indexOf('.'));

    return `${definition.kind}.v${major}.json`;
  }

  /** Keys are sorted at every depth, so the output depends only on what the schema says. */
  static async render(definition: RegisteredMessage): Promise<string> {
    const jsonSchema = z.toJSONSchema(definition.schema, {
      target: 'draft-2020-12',
      io: 'input',
    });

    const keys = new Set<string>();
    JSON.stringify(jsonSchema, (key: string, value: JsonValue) => {
      keys.add(key);

      return value;
    });

    return format(JSON.stringify(jsonSchema, [...keys].sort()), {
      parser: 'json',
    });
  }
}

await JsonSchemaGenerator.writeAll();
