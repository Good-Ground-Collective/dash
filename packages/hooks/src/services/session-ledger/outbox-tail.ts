import { open } from 'node:fs/promises';

import { z } from 'zod';

import { jsonLineSchema } from '#src/contracts/json-line.js';

const seqLineSchema = jsonLineSchema.pipe(
  z.looseObject({ payload: z.looseObject({ seq: z.int().nonnegative() }) }),
);

/** Reads the highest `seq` already in a session's outbox file, for a session whose counter file is gone. */
export class OutboxTail {
  static readonly TAIL_BYTES = 64 * 1024;

  /** The highest `seq` among the last lines of the file, or `undefined` when it has none. */
  static async lastSeq(outboxPath: string): Promise<number | undefined> {
    let text: string;
    try {
      text = await OutboxTail.readTail(outboxPath);
    } catch {
      return undefined;
    }

    const seqs = text.split('\n').flatMap((line) => {
      const parsed = seqLineSchema.safeParse(line);
      return parsed.success ? [parsed.data.payload.seq] : [];
    });
    return seqs.length === 0 ? undefined : Math.max(...seqs);
  }

  private static async readTail(outboxPath: string): Promise<string> {
    const handle = await open(outboxPath, 'r');
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, OutboxTail.TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      return buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  }
}
