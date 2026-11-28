import { link, stat, truncate, utimes } from 'node:fs/promises';

import { vi } from 'vitest';

import { RecordedPayloads } from '#src/__tests__/support/recorded-payloads.js';
import type { ScratchState } from '#src/__tests__/support/scratch-state.js';
import { MissionControlIngest } from '#src/services/mission-control-ingest/mission-control-ingest.js';
import { OutboxRetention } from '#src/services/outbox-retention/outbox-retention.js';
import { RelayCursorStore } from '#src/services/relay-cursor-store/relay-cursor-store.js';
import { FileSessionLedger } from '#src/services/session-ledger/session-ledger.js';

/** Arranges what happens to the outbox while a batch is in flight, between the send and the cursor save. */
export class RetentionRace {
  private readonly state: ScratchState;

  constructor(state: ScratchState) {
    this.state = state;
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

  /** Retention prunes the outbox, then the resumed session writes a fresh one. */
  async pruneThenResume(): Promise<void> {
    await OutboxRetention.prune(this.state.config, new Date());
    await this.state.writeTurns(1);
  }

  async truncateOutbox(): Promise<void> {
    await truncate(this.outboxPath(), 0);
  }
}
