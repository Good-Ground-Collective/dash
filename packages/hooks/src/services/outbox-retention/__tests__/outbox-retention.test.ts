import { mkdir, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ScratchState } from '#src/__tests__/support/scratch-state.js';
import { FileLock } from '#src/services/file-lock/file-lock.js';
import { OutboxRetention } from '#src/services/outbox-retention/outbox-retention.js';
import { RelayCursorStore } from '#src/services/relay-cursor-store/relay-cursor-store.js';

const now = new Date('2026-11-27T09:30:00Z');
const longAgo = new Date('2026-01-01T00:00:00Z');
const stem = 'session-one';

let state: ScratchState;

beforeEach(() => {
  state = new ScratchState();
});

afterEach(async () => {
  await state.remove();
});

/** Writes an expired outbox with a relay cursor, and answers whether files still exist. */
class RetentionFixture {
  static async exists(file: string): Promise<boolean> {
    return stat(file).then(
      () => true,
      () => false,
    );
  }

  static async writeExpiredOutbox(): Promise<{
    outbox: string;
    cursor: string;
    lock: string;
  }> {
    const outbox = path.join(state.config.outboxDirectory, `${stem}.jsonl`);
    await mkdir(state.config.outboxDirectory, { recursive: true });
    await mkdir(state.config.sessionsDirectory, { recursive: true });
    await writeFile(outbox, '{}\n');
    await utimes(outbox, longAgo, longAgo);
    await RelayCursorStore.save(state.config.relayCursorsDirectory, stem, {
      inode: 1,
      offset: 3,
      ackedSeq: 0,
    });

    return {
      outbox,
      cursor: RelayCursorStore.cursorPath(
        state.config.relayCursorsDirectory,
        stem,
      ),
      lock: path.join(state.config.sessionsDirectory, `${stem}.json.lock`),
    };
  }
}

describe('OutboxRetention', () => {
  it("removes an expired outbox's cursor and outbox only once the session's lock is free", async () => {
    const files = await RetentionFixture.writeExpiredOutbox();
    let pruning: Promise<string[]> | undefined;

    await new FileLock({ lockPath: files.lock }).hold(async () => {
      pruning = OutboxRetention.prune(state.config, now);
      await sleep(150);

      expect(await RetentionFixture.exists(files.outbox)).toBe(true);
      expect(await RetentionFixture.exists(files.cursor)).toBe(true);
    });

    expect(await pruning).toEqual([files.outbox]);
    expect(await RetentionFixture.exists(files.outbox)).toBe(false);
    expect(await RetentionFixture.exists(files.cursor)).toBe(false);
  });

  it('keeps an outbox that a resumed session wrote to while retention waited for the lock', async () => {
    const files = await RetentionFixture.writeExpiredOutbox();
    let pruning: Promise<string[]> | undefined;

    await new FileLock({ lockPath: files.lock }).hold(async () => {
      pruning = OutboxRetention.prune(state.config, now);
      await sleep(50);
      await utimes(files.outbox, now, now);
    });

    expect(await pruning).toEqual([]);
    expect(await RetentionFixture.exists(files.outbox)).toBe(true);
    expect(await RetentionFixture.exists(files.cursor)).toBe(true);
  });
});
