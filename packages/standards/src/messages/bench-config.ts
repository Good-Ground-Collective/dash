import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';

/** What the daemon pulls from Dash: which processes to watch and how often to sample. */
export const benchConfig = new MessageDefinition({
  kind: 'bench.config',
  version: '1.0',
  payload: z.object({
    watchList: z
      .array(z.string().min(1).max(256))
      .max(256)
      .describe('The process names to watch.'),
    samplingIntervalSeconds: z
      .int()
      .min(1)
      .describe(
        'How often to sample metrics, in seconds. Dash defaults to 30.',
      ),
  }),
});

export type BenchConfig = z.infer<typeof benchConfig.schema>;
