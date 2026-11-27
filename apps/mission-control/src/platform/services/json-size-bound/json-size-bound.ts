import { z } from 'zod';

import { UnboundedJsonSchemaError } from '#src/platform/errors.ts';

type JsonSchemaNode = z.core.JSONSchema._JSONSchema;
type JsonSchemaObject = z.core.JSONSchema.JSONSchema;

/** The most bytes one string character can take in JSON: a control character escaped as `\u001f`. */
const bytesPerCharacter = 6;

/** Characters allowed for a string with only a format or pattern, such as a UUID or a timestamp. */
const unsizedStringCharacters = 64;

/** Characters in the longest JSON number, such as `-1.7976931348623157e+308`. */
const numberCharacters = 24;

/**
 * The largest JSON a schema accepts, in UTF-8 bytes, read from the limits its fields declare. Each
 * string counts `maxLength` characters at their worst-case escaped size, so a limit sized from it
 * holds any valid document. Fields a schema drops aren't counted, since they have no limit.
 */
export class JsonSizeBound {
  /** Throws `UnboundedJsonSchemaError` for an array without `maxItems` or an object open to any key. */
  static maxBytes(schema: z.ZodType): number {
    return JsonSizeBound.of(z.toJSONSchema(schema, { io: 'input' }));
  }

  private static of(node: JsonSchemaNode): number {
    if (node === false) {
      return 0;
    }
    if (node === true) {
      throw new UnboundedJsonSchemaError({
        reason: 'a field accepts any value',
      });
    }

    const branches = node.anyOf ?? node.oneOf;
    if (branches !== undefined) {
      return Math.max(...branches.map((branch) => JsonSizeBound.of(branch)));
    }
    const values = node.const === undefined ? node.enum : [node.const];
    if (values !== undefined) {
      return Math.max(...values.map((value) => JsonSizeBound.encoded(value)));
    }

    const types = [node.type ?? []].flat();
    if (types.length === 0) {
      throw new UnboundedJsonSchemaError({ reason: 'a field has no type' });
    }
    return Math.max(...types.map((type) => JsonSizeBound.ofType(node, type)));
  }

  private static ofType(
    node: JsonSchemaObject,
    type: z.core.JSONSchema.SchemaType,
  ): number {
    if (type === 'string') {
      const characters = node.maxLength ?? unsizedStringCharacters;
      return 2 + characters * bytesPerCharacter;
    }
    if (type === 'number' || type === 'integer') {
      return numberCharacters;
    }
    if (type === 'boolean' || type === 'null') {
      return JsonSizeBound.encoded(false);
    }
    if (type === 'array') {
      return JsonSizeBound.ofArray(node);
    }
    return JsonSizeBound.ofObject(node);
  }

  private static ofArray(node: JsonSchemaObject): number {
    if (node.maxItems === undefined || Array.isArray(node.items)) {
      throw new UnboundedJsonSchemaError({
        reason: 'an array has no maxItems',
      });
    }
    const item = JsonSizeBound.of(node.items ?? true);
    return JsonSizeBound.bracketed(
      Array.from({ length: node.maxItems }, () => item),
    );
  }

  private static ofObject(node: JsonSchemaObject): number {
    const open = node.additionalProperties ?? false;
    if (open !== false || node.patternProperties !== undefined) {
      throw new UnboundedJsonSchemaError({ reason: 'an object takes any key' });
    }

    const members = Object.entries(node.properties ?? {}).map(
      ([key, value]) =>
        JsonSizeBound.encoded(key) + 1 + JsonSizeBound.of(value),
    );
    return JsonSizeBound.bracketed(members);
  }

  /** Bytes for members inside brackets or braces, with a comma between each. */
  private static bracketed(members: number[]): number {
    const commas = Math.max(members.length - 1, 0);
    return 2 + commas + members.reduce((sum, bytes) => sum + bytes, 0);
  }

  private static encoded(value: string | number | boolean | null): number {
    return Buffer.byteLength(JSON.stringify(value));
  }
}
