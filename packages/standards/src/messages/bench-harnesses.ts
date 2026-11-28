import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';
import { benchHarnessId } from '#src/messages/bench-harness-id.js';

/** The harnesses the daemon found on a bench. */
export const benchHarnesses = new MessageDefinition({
  kind: 'bench.harnesses',
  version: '1.0',
  payload: z.object({
    harnesses: z
      .array(
        z.object({
          id: benchHarnessId,
          version: z
            .string()
            .min(1)
            .max(100)
            .describe("The harness's installed version."),
        }),
      )
      .max(64)
      .describe('Each harness the daemon found.'),
  }),
});

export type BenchHarnesses = z.infer<typeof benchHarnesses.schema>;
