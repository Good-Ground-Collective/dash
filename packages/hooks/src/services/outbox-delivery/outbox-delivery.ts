import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { HooksConfig } from '#src/config/hooks-config.js';
import { jsonLineSchema } from '#src/contracts/json-line.js';
import {
  HeartbeatRejectedError,
  UnreadableOutboxLineError,
} from '#src/errors.js';
import { FileLock } from '#src/services/file-lock/file-lock.js';
import type { HookLog } from '#src/services/hook-log/hook-log.js';
import { MissionControlIngest } from '#src/services/mission-control-ingest/mission-control-ingest.js';
import type { OutboxBatch } from '#src/services/outbox-reader/outbox-batch.js';
import { OutboxReader } from '#src/services/outbox-reader/outbox-reader.js';
import type { RelayCursor } from '#src/services/relay-cursors/relay-cursor.js';
import { RelayCursors } from '#src/services/relay-cursors/relay-cursors.js';

const outboxDeliveryPropsSchema = z.object({
  config: z.instanceof(HooksConfig),
  ingest: z.instanceof(MissionControlIngest),
  log: z.custom<HookLog>(),
});

export type OutboxDeliveryProps = z.input<typeof outboxDeliveryPropsSchema>;

const endedSessionSchema = jsonLineSchema.pipe(
  z.looseObject({ ended: z.literal(true) }),
);

/**
 * Sends every session's unacknowledged outbox lines to Mission Control in order, a batch at a time,
 * and moves the session's cursor past each batch once Mission Control has answered for it. Lines it
 * rejects as invalid are logged and passed over. A session that has ended and is fully delivered has
 * its outbox and cursor deleted.
 */
export class OutboxDelivery {
  private readonly config: HooksConfig;
  private readonly ingest: MissionControlIngest;
  private readonly log: HookLog;

  constructor(props: OutboxDeliveryProps) {
    const valid = outboxDeliveryPropsSchema.parse(props);

    this.config = valid.config;
    this.ingest = valid.ingest;
    this.log = valid.log;
  }

  private get cursorsDirectory(): string {
    return this.config.relayCursorsDirectory;
  }

  /** Delivers everything currently in the outbox; `true` when it sent or passed over any line. Throws when Mission Control can't take a batch. */
  async deliverAll(): Promise<boolean> {
    const stems = await this.outboxStems();

    let progressed = false;
    for (const stem of stems) {
      if (await this.deliverSession(stem)) {
        progressed = true;
      }
    }

    await this.forgetCursorsWithoutOutbox(stems);
    return progressed;
  }

  /** Whether any session has lines its cursor hasn't passed. */
  async hasUndelivered(): Promise<boolean> {
    for (const stem of await this.outboxStems()) {
      const cursor = await RelayCursors.load(this.cursorsDirectory, stem);
      const batch = await OutboxReader.read(this.outboxPath(stem), cursor);
      if (batch !== undefined && batch.endOffset > batch.startOffset) {
        return true;
      }
    }
    return false;
  }

  private async deliverSession(stem: string): Promise<boolean> {
    let cursor = await RelayCursors.load(this.cursorsDirectory, stem);
    let progressed = false;

    for (;;) {
      const batch = await OutboxReader.read(this.outboxPath(stem), cursor);
      if (batch === undefined) {
        return progressed;
      }
      if (batch.endOffset === batch.startOffset) {
        break;
      }

      await this.send(stem, batch);
      cursor = OutboxDelivery.advance(cursor, batch);
      await RelayCursors.save(this.cursorsDirectory, stem, cursor);
      progressed = true;
    }

    await this.removeIfFinished(stem, cursor);
    return progressed;
  }

  /** Sends the batch's lines, then logs any Mission Control rejected and any that weren't JSON. */
  private async send(stem: string, batch: OutboxBatch): Promise<void> {
    const outboxPath = this.outboxPath(stem);
    const results =
      batch.entries.length === 0
        ? []
        : await this.ingest.send(
            batch.entries.map(({ heartbeat }) => heartbeat),
          );

    const now = new Date();
    results.forEach((result, index) => {
      if (result.outcome === 'invalid') {
        const cause = new HeartbeatRejectedError({
          outboxPath,
          seq: batch.entries[index]?.seq,
          issues: result.issues,
        });
        this.log.failure({ event: 'relay', cause, now });
      }
    });
    for (const offset of batch.unreadableOffsets) {
      const cause = new UnreadableOutboxLineError({ outboxPath, offset });
      this.log.failure({ event: 'relay', cause, now });
    }
  }

  /**
   * Deletes the session's outbox and cursor when the session has ended and every line is delivered.
   * It holds the session's own lock, the one the hooks append under, so a resumed session can't add a
   * line between the check and the delete.
   */
  private async removeIfFinished(
    stem: string,
    cursor: RelayCursor,
  ): Promise<void> {
    const statePath = path.join(this.config.sessionsDirectory, `${stem}.json`);
    if (!(await OutboxDelivery.hasEnded(statePath))) {
      return;
    }

    try {
      await new FileLock({ lockPath: `${statePath}.lock` }).hold(async () => {
        const outbox = await stat(this.outboxPath(stem)).catch(() => undefined);
        const delivered =
          outbox?.ino === cursor.inode && outbox.size === cursor.offset;
        if (delivered && (await OutboxDelivery.hasEnded(statePath))) {
          await rm(this.outboxPath(stem), { force: true });
          await RelayCursors.remove(this.cursorsDirectory, stem);
        }
      });
    } catch (cause) {
      this.log.failure({ event: 'relay', cause, now: new Date() });
    }
  }

  /** Drops cursors whose outbox retention deleted, so a session resumed later starts its new file from the top. */
  private async forgetCursorsWithoutOutbox(stems: string[]): Promise<void> {
    const live = new Set(stems);
    const names = await readdir(this.cursorsDirectory).catch(() => []);

    for (const name of names) {
      const stem = name.endsWith('.json')
        ? name.slice(0, -'.json'.length)
        : undefined;
      if (stem !== undefined && !live.has(stem)) {
        await RelayCursors.remove(this.cursorsDirectory, stem);
      }
    }
  }

  private async outboxStems(): Promise<string[]> {
    const names = await readdir(this.config.outboxDirectory).catch(() => []);
    return names
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => name.slice(0, -'.jsonl'.length));
  }

  private outboxPath(stem: string): string {
    return path.join(this.config.outboxDirectory, `${stem}.jsonl`);
  }

  private static advance(cursor: RelayCursor, batch: OutboxBatch): RelayCursor {
    const seqs = batch.entries.flatMap(({ seq }) =>
      seq === undefined ? [] : [seq],
    );
    const highest = Math.max(cursor.ackedSeq ?? -1, ...seqs);

    return {
      inode: batch.inode,
      offset: batch.endOffset,
      ackedSeq: highest < 0 ? null : highest,
    };
  }

  private static async hasEnded(statePath: string): Promise<boolean> {
    const text = await readFile(statePath, 'utf8').catch(() => undefined);
    return endedSessionSchema.safeParse(text).success;
  }
}
