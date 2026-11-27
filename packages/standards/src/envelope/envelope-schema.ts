import { z } from 'zod';

/**
 * Wraps a payload schema in the fields every message carries. `schemaVersion` accepts any minor
 * version of `major`, so a reader built against `1.0` still reads `1.3`, and rejects every other
 * major.
 */
export function envelopeSchema<
  const Kind extends string,
  Payload extends z.ZodObject,
>(props: { kind: Kind; major: string; payload: Payload }) {
  return z.object({
    schemaVersion: z
      .string()
      .regex(new RegExp(`^${props.major}\\.(0|[1-9]\\d*)$`))
      .describe(
        `The \`<major>.<minor>\` version of this message kind. Readers accept any \`${props.major}.x\`.`,
      ),
    kind: z.literal(props.kind),
    id: z
      .uuid()
      .describe('Unique per message, so receivers can drop duplicates.'),
    emittedAt: z.iso
      .datetime()
      .describe('When the sender emitted the message, in UTC.'),
    payload: props.payload,
  });
}
