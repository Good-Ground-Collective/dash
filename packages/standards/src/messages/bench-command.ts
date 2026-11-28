import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';
import { benchHarnessId } from '#src/messages/bench-harness-id.js';

/** The payload keys a command line could arrive under. A `bench.command` never carries any of them. */
export const forbiddenCommandKeys = ['command', 'commandLine', 'args'] as const;

/**
 * A request to update one harness. It names the harness by its allowlist id and never carries a
 * command line. Unknown fields are ignored like on every wire schema, except `command`,
 * `commandLine` and `args`, which are rejected by name in Zod and in the JSON Schema. The payload
 * is a loose object so the key check sees the raw keys; `additionalProperties` is left unset in
 * the JSON Schema, which keeps the generated Go struct to the two fields below.
 */
export const benchCommand = new MessageDefinition({
  kind: 'bench.command',
  version: '1.0',
  payload: z
    .looseObject({
      commandId: z
        .string()
        .min(1)
        .max(256)
        .describe('Ties the result to this request.'),
      harnessId: benchHarnessId,
    })
    .check(
      z.superRefine((payload, context) => {
        for (const key of forbiddenCommandKeys) {
          if (key in payload) {
            context.addIssue({
              code: 'custom',
              path: [key],
              message: `bench.command never carries \`${key}\`: name the harness by its allowlist id.`,
            });
          }
        }
      }),
    )
    .meta({
      additionalProperties: undefined,
      propertyNames: { not: { enum: [...forbiddenCommandKeys] } },
    }),
});

export type BenchCommand = z.infer<typeof benchCommand.schema>;
