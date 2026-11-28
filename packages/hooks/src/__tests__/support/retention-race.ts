import { link, stat, truncate, utimes } from 'node:fs/promises';
import path from 'node:path';

import { vi } from 'vitest';
import { z } from 'zod';

import { RecordedPayloads } from '#src/__tests__/support/recorded-payloads.js';
import { ScratchState } from '#src/__tests__/support/scratch-state.js';
import { MissionControlIngest } from '#src/services/mission-control-ingest/mission-control-ingest.js';
import { OutboxReader } from '#src/services/outbox-reader/outbox-reader.js';
import { OutboxRetention } from '#src/services/outbox-retention/outbox-retention.js';
import { RelayCursorStore } from '#src/services/relay-cursor-store/relay-cursor-store.js';
import { FileSessionLedger } from '#src/services/session-ledger/session-ledger.js';

const retentionRacePropsSchema = z.object({
  state: z.instanceof(ScratchState),
});

export type RetentionRaceProps = z.input<typeof retentionRacePropsSchema>;

/** Arranges what happens to the outbox while a batch is in flight, between the send and the cursor save. */
export class RetentionRace {
  private readonly state: ScratchState;

  constructor(props: RetentionRaceProps) {
    const valid = retentionRacePropsSchema.parse(props);

    this.state = valid.state;
  }

  outboxPath(): string {
    return this.state.outboxPath(RecordedPayloads.SESSION_ID);
  }

  cursorStem(): string {
    return FileSessionLedger.fileStem(RecordedPayloads.SESSION_ID);
  }

  /** Runs `duringSend` after the next batch has been sent and before the relay saves its cursor. */
  afterNextSend(duringSend: () => Promise<void>): void {
    const send = MissionControlIngest.prototype.send;
    vi.spyOn(MissionControlIngest.prototype, 'send').mockImplementationOnce(
      async function (this: MissionControlIngest, ...args) {
        const results = await send.apply(this, args);
        await duringSend();
        return results;
      },
    );
  }

  /** Runs `beforeRead` as the next outbox read begins, after the relay has loaded its cursor and before it reads. */
  beforeNextRead(beforeRead: () => Promise<void>): void {
    const read = OutboxReader.read;
    vi.spyOn(OutboxReader, 'read').mockImplementationOnce(
      async (...args: Parameters<typeof OutboxReader.read>) => {
        await beforeRead();
        return read.apply(OutboxReader, args);
      },
    );
  }

  /** Gives the outbox's inode a second name, so an outbox recreated later can't reuse it; returns the inode. */
  async keepInode(): Promise<number> {
    const kept = `${this.outboxPath()}.keep`;
    await link(this.outboxPath(), kept);
    return (await stat(kept)).ino;
  }

  async cursorExists(): Promise<boolean> {
    const cursorPath = RelayCursorStore.cursorPath(
      this.state.config.relayCursorsDirectory,
      this.cursorStem(),
    );
    return stat(cursorPath).then(
      () => true,
      () => false,
    );
  }

  /** The resumed session's heartbeat seqs in its outbox, and those Mission Control stored. */
  async seqs(
    stored: readonly { sessionId: string; seq: number }[],
  ): Promise<{ resumed: number[]; stored: number[] }> {
    const heartbeats = await this.state.heartbeats(RecordedPayloads.SESSION_ID);
    return {
      resumed: heartbeats.map(({ payload }) => payload.seq),
      stored: stored
        .filter(({ sessionId }) => sessionId === RecordedPayloads.SESSION_ID)
        .map(({ seq }) => seq),
    };
  }

  /** True when no cursor is on disk, or the one saved belongs to `outbox` and lies within it. */
  async cursorFits(outbox: { ino: number; size: number }): Promise<boolean> {
    if (!(await this.cursorExists())) {
      return true;
    }
    const cursor = await RelayCursorStore.load(
      this.state.config.relayCursorsDirectory,
      this.cursorStem(),
    );
    return cursor.inode === outbox.ino && cursor.offset <= outbox.size;
  }

  /** Ages the outbox past retention and keeps its inode from being reused; returns the inode. */
  async expireOutbox(): Promise<number> {
    await utimes(this.outboxPath(), new Date(0), new Date(0));
    return this.keepInode();
  }

  /** Ages the session's state file past retention, so a resumed session's `seq` restarts at 0. */
  async expireSessionState(): Promise<void> {
    const statePath = path.join(
      this.state.config.sessionsDirectory,
      `${this.cursorStem()}.json`,
    );
    await utimes(statePath, new Date(0), new Date(0));
  }

  /** Retention prunes the outbox, then the resumed session writes a fresh one. */
  async pruneThenResume(): Promise<void> {
    await OutboxRetention.prune(this.state.config, new Date());
    await this.state.writeTurns(1);
  }

  async truncateOutbox(): Promise<void> {
    await truncate(this.outboxPath(), 0);
  }
}
