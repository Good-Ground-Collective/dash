import { z } from 'zod';

/** How far Mission Control has acknowledged one session's outbox, kept in `relay/<sessionId>.json`. */
export const relayCursorSchema = z.object({
  inode: z
    .number()
    .nonnegative()
    .default(0)
    .describe(
      'The outbox file the offset belongs to; a different file is read from its start. Inodes get reused, so retention deletes the cursor along with its outbox.',
    ),
  offset: z
    .int()
    .nonnegative()
    .default(0)
    .describe('Bytes of the outbox file acknowledged, always at a line end.'),
  ackedSeq: z
    .int()
    .nonnegative()
    .nullable()
    .default(null)
    .describe(
      'The highest `seq` acknowledged. A line at or below it is not sent again when a file is read from its start.',
    ),
});

export type RelayCursor = z.output<typeof relayCursorSchema>;
