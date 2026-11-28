import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';

/** What a bench is, sent by its daemon when it starts. */
export const benchInfo = new MessageDefinition({
  kind: 'bench.info',
  version: '1.0',
  payload: z.object({
    hostname: z.string().min(1).max(256).describe("The bench's hostname."),
    os: z
      .object({
        name: z
          .string()
          .min(1)
          .max(100)
          .describe('The operating system, such as `darwin` or `linux`.'),
        version: z
          .string()
          .min(1)
          .max(100)
          .describe('The operating system version.'),
      })
      .describe('The operating system the bench runs.'),
    architecture: z
      .string()
      .min(1)
      .max(50)
      .describe('The CPU architecture, such as `arm64` or `amd64`.'),
    cpu: z
      .object({
        model: z.string().min(1).max(256).describe('The CPU model name.'),
        cores: z.int().min(1).describe('The number of logical cores.'),
      })
      .describe('The processor.'),
    memoryTotalBytes: z
      .int()
      .min(0)
      .describe('Total physical memory, in bytes.'),
    daemonVersion: z
      .string()
      .min(1)
      .max(100)
      .describe('The version of the daemon that sent this.'),
  }),
});

export type BenchInfo = z.infer<typeof benchInfo.schema>;
