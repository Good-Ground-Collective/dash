import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';
import { benchHarnessId } from '#src/messages/bench-harness-id.js';

/**
 * A request to update one harness. It names the harness by its allowlist id and never carries a
 * command line: the payload is strict, so a message with any other field fails to parse.
 */
export const benchCommand = new MessageDefinition({
  kind: 'bench.command',
  version: '1.0',
  payload: z.strictObject({
    commandId: z
      .string()
      .min(1)
      .max(256)
      .describe('Ties the result to this request.'),
    harnessId: benchHarnessId,
  }),
});

export type BenchCommand = z.infer<typeof benchCommand.schema>;
