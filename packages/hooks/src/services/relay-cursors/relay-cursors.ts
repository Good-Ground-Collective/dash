import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { jsonLineSchema } from '#src/contracts/json-line.js';
import {
  type RelayCursor,
  relayCursorSchema,
} from '#src/services/relay-cursors/relay-cursor.js';

const relayCursorFileSchema = jsonLineSchema.pipe(relayCursorSchema);

/** Reads and writes each session's relay cursor, one small file per session. */
export class RelayCursors {
  /** The session's cursor, or a fresh one at the start of the outbox when it has none or it is damaged. */
  static async load(directory: string, stem: string): Promise<RelayCursor> {
    const text = await readFile(
      RelayCursors.cursorPath(directory, stem),
      'utf8',
    ).catch(() => undefined);
    const parsed = relayCursorFileSchema.safeParse(text);
    return parsed.success ? parsed.data : relayCursorSchema.parse({});
  }

  /** Writes to a temporary file and renames it, so a relay killed mid-write leaves the previous cursor whole. */
  static async save(
    directory: string,
    stem: string,
    cursor: RelayCursor,
  ): Promise<void> {
    const cursorPath = RelayCursors.cursorPath(directory, stem);
    const temporary = `${cursorPath}.${process.pid}.tmp`;

    await mkdir(directory, { recursive: true });
    await writeFile(temporary, JSON.stringify(cursor));
    await rename(temporary, cursorPath);
  }

  static async remove(directory: string, stem: string): Promise<void> {
    await rm(RelayCursors.cursorPath(directory, stem), { force: true });
  }

  static cursorPath(directory: string, stem: string): string {
    return path.join(directory, `${stem}.json`);
  }
}
