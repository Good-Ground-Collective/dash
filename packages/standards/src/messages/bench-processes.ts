import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';

/** How each watched process name is doing. It carries counts only, never process ids or command lines, which can hold secrets. */
export const benchProcesses = new MessageDefinition({
  kind: 'bench.processes',
  version: '1.0',
  payload: z.object({
    processes: z
      .array(
        z.object({
          name: z
            .string()
            .min(1)
            .max(256)
            .describe('The watched process name, as on the watch list.'),
          running: z
            .boolean()
            .describe(
              'Whether at least one instance is running: true exactly when `instances` is above 0. When the two disagree, `instances` is authoritative.',
            ),
          instances: z.int().min(0).describe('How many instances are running.'),
          cpuPercent: z
            .number()
            .min(0)
            .describe(
              "The instances' combined CPU use, as a percentage of one core, so it can pass 100.",
            ),
          memoryBytes: z
            .int()
            .min(0)
            .describe("The instances' combined memory, in bytes."),
        }),
      )
      .max(256)
      .describe('One entry for each name on the watch list.'),
  }),
});

export type BenchProcesses = z.infer<typeof benchProcesses.schema>;
