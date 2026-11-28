import { mkdtempSync, rmSync } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OutboxReader } from '#src/services/outbox-reader/outbox-reader.js';
import { relayCursorSchema } from '#src/services/relay-cursor-store/relay-cursor.js';

let directory: string;
let outboxPath: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'dash-outbox-reader-'));
  outboxPath = path.join(directory, 'session.jsonl');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** Outbox lines carrying only a `seq`, which is all the reader looks at. */
class OutboxLines {
  static line(seq: number): string {
    return `${JSON.stringify({ payload: { seq } })}\n`;
  }
}

describe('OutboxReader.read', () => {
  it('leaves a line that is still being written for the next read', async () => {
    await writeFile(
      outboxPath,
      `${OutboxLines.line(0)}${OutboxLines.line(1)}{"payload":`,
    );

    const batch = await OutboxReader.read(
      outboxPath,
      relayCursorSchema.parse({}),
    );

    expect(batch?.entries.map(({ seq }) => seq)).toEqual([0, 1]);
    expect(batch?.endOffset).toBe(
      OutboxLines.line(0).length + OutboxLines.line(1).length,
    );
  });

  it('reads a replaced file from its start, passing over seqs already acknowledged', async () => {
    await writeFile(
      outboxPath,
      `${OutboxLines.line(4)}${OutboxLines.line(5)}${OutboxLines.line(6)}`,
    );
    const { ino } = await stat(outboxPath);

    const batch = await OutboxReader.read(
      outboxPath,
      relayCursorSchema.parse({ inode: ino + 1, offset: 9_999, ackedSeq: 4 }),
    );

    expect(batch?.startOffset).toBe(0);
    expect(batch?.entries.map(({ seq }) => seq)).toEqual([5, 6]);
  });

  it('stops at one batch of lines', async () => {
    await writeFile(
      outboxPath,
      Array.from({ length: 150 }, (_, seq) => OutboxLines.line(seq)).join(''),
    );

    const batch = await OutboxReader.read(
      outboxPath,
      relayCursorSchema.parse({}),
    );

    expect(batch?.entries).toHaveLength(OutboxReader.MAX_LINES);
  });
});
