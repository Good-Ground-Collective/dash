import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';
import { benchHarnessId } from '#src/messages/bench-harness-id.js';

/** How a `bench.command` went. */
export const benchCommandResult = new MessageDefinition({
  kind: 'bench.command-result',
  version: '1.0',
  payload: z.object({
    commandId: z
      .string()
      .min(1)
      .max(256)
      .describe('The `commandId` of the request this answers.'),
    harnessId: benchHarnessId,
    exitStatus: z.int().describe("The update command's exit status."),
    outputTail: z
      .string()
      .max(4000)
      .describe(
        'The end of the command output, trimmed to fit. The daemon must redact secrets before sending, and Dash treats the tail as untrusted text.',
      ),
    versionAfter: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe(
        "The harness's installed version after the update, when the daemon could read it.",
      ),
  }),
});

export type BenchCommandResult = z.infer<typeof benchCommandResult.schema>;
