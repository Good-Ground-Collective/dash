import { type FileHandle, open } from 'node:fs/promises';

import { z } from 'zod';

import { jsonLineSchema } from '#src/contracts/json-line.js';
import type { OutboxBatch } from '#src/services/outbox-reader/outbox-batch.js';
import type { RelayCursor } from '#src/services/relay-cursors/relay-cursor.js';

const seqSchema = z.looseObject({
  payload: z.looseObject({ seq: z.int().nonnegative() }),
});

/** Reads the next batch of complete lines from a session's outbox, starting at its relay cursor. */
export class OutboxReader {
  /** Matches the most heartbeats Mission Control's batch route takes at once. */
  static readonly MAX_LINES = 100;

  /** Well over a full batch of outbox lines, which stay under 4 KB each. */
  static readonly MAX_BYTES = 1024 * 1024;

  /** The batch after the cursor, or `undefined` when the outbox file doesn't exist. */
  static async read(
    outboxPath: string,
    cursor: RelayCursor,
  ): Promise<OutboxBatch | undefined> {
    let handle: FileHandle;
    try {
      handle = await open(outboxPath, 'r');
    } catch (error) {
      if (OutboxReader.hasCode(error, 'ENOENT')) {
        return undefined;
      }
      throw error;
    }

    try {
      const { ino, size } = await handle.stat();
      const sameFile = cursor.inode === ino && cursor.offset <= size;
      const start = sameFile ? cursor.offset : 0;
      const buffer = Buffer.alloc(
        Math.min(size - start, OutboxReader.MAX_BYTES),
      );
      await handle.read(buffer, 0, buffer.length, start);
      return OutboxReader.parse(buffer, {
        inode: ino,
        start,
        ackedSeq: cursor.ackedSeq,
      });
    } finally {
      await handle.close();
    }
  }

  private static parse(
    buffer: Buffer,
    at: { inode: number; start: number; ackedSeq: number | null },
  ): OutboxBatch {
    const batch: OutboxBatch = {
      inode: at.inode,
      startOffset: at.start,
      endOffset: at.start,
      entries: [],
      unreadableOffsets: [],
    };

    let position = 0;
    while (batch.entries.length < OutboxReader.MAX_LINES) {
      const newline = buffer.indexOf(0x0a, position);
      if (newline === -1) {
        break;
      }
      OutboxReader.take(batch, buffer.toString('utf8', position, newline), {
        offset: at.start + position,
        ackedSeq: at.ackedSeq,
      });
      position = newline + 1;
    }

    if (position === 0 && buffer.length === OutboxReader.MAX_BYTES) {
      batch.unreadableOffsets.push(at.start);
      position = buffer.length;
    }
    batch.endOffset = at.start + position;
    return batch;
  }

  /** Adds one line to the batch, unless it is blank or already acknowledged. */
  private static take(
    batch: OutboxBatch,
    line: string,
    at: { offset: number; ackedSeq: number | null },
  ): void {
    if (line.trim() === '') {
      return;
    }

    const parsed = jsonLineSchema.safeParse(line);
    if (!parsed.success) {
      batch.unreadableOffsets.push(at.offset);
      return;
    }

    const numbered = seqSchema.safeParse(parsed.data);
    const seq = numbered.success ? numbered.data.payload.seq : undefined;
    if (seq !== undefined && at.ackedSeq !== null && seq <= at.ackedSeq) {
      return;
    }
    batch.entries.push({ heartbeat: parsed.data, seq });
  }

  private static hasCode(cause: unknown, code: string): boolean {
    return cause instanceof Error && 'code' in cause && cause.code === code;
  }
}
