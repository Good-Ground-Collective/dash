import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';

const byteCount = z.int().min(0);

/** One resource sample. A daemon that backfills after being offline sends one message per sample. */
export const benchMetrics = new MessageDefinition({
  kind: 'bench.metrics',
  version: '1.0',
  payload: z.object({
    sampledAt: z.iso
      .datetime()
      .describe(
        'When the sample was taken, in UTC. Differs from `emittedAt` for a backfilled sample.',
      ),
    cpuPercent: z
      .number()
      .min(0)
      .max(100)
      .describe('CPU use across all cores, as a percentage.'),
    memory: z
      .object({
        usedBytes: byteCount.describe('Memory in use, in bytes.'),
        totalBytes: byteCount.describe('Total physical memory, in bytes.'),
      })
      .describe('Memory use.'),
    disks: z
      .array(
        z.object({
          volume: z
            .string()
            .min(1)
            .max(1024)
            .describe('The volume, such as a mount point or a drive letter.'),
          usedBytes: byteCount.describe('Space in use, in bytes.'),
          totalBytes: byteCount.describe('Total space, in bytes.'),
        }),
      )
      .max(64)
      .describe('Disk use for each volume.'),
    network: z
      .object({
        bytesIn: byteCount.describe(
          'Bytes received since the previous sample.',
        ),
        bytesOut: byteCount.describe('Bytes sent since the previous sample.'),
      })
      .describe('Network traffic since the previous sample.'),
  }),
});

export type BenchMetrics = z.infer<typeof benchMetrics.schema>;
