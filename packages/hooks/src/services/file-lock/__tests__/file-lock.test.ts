import { mkdtempSync } from 'node:fs';
import { readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionLockTimeoutError } from '#src/errors.js';
import { FileLock } from '#src/services/file-lock/file-lock.js';

let directory: string;
let lockPath: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'dash-lock-'));
  lockPath = path.join(directory, 'session.json.lock');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** Lock files on disk, as a dead or overrunning holder would leave them. */
class LockFiles {
  static async ageBeyondStale(): Promise<void> {
    const past = new Date(Date.now() - FileLock.STALE_MS - 1_000);
    await utimes(lockPath, past, past);
  }

  static async leaveStale(token: string): Promise<void> {
    await writeFile(lockPath, token);
    await LockFiles.ageBeyondStale();
  }

  static async contents(): Promise<string | undefined> {
    return readFile(lockPath, 'utf8').catch(() => undefined);
  }
}

describe('FileLock stale takeover', () => {
  it('takes over a lock left behind by a process that died holding it', async () => {
    await LockFiles.leaveStale('dead-holder');

    expect(await FileLock.hold(lockPath, async () => 'held')).toBe('held');
    expect(await LockFiles.contents()).toBeUndefined();
  });

  it('never lets waiters that all find the same stale lock hold it at once', async () => {
    let active = 0;
    let mostActive = 0;

    for (let round = 0; round < 40; round += 1) {
      await LockFiles.leaveStale('dead-holder');
      await Promise.all(
        Array.from({ length: 12 }, () =>
          FileLock.hold(lockPath, async () => {
            active += 1;
            mostActive = Math.max(mostActive, active);
            await sleep(1);
            active -= 1;
          }),
        ),
      );
    }

    expect(mostActive).toBe(1);
    expect(await readdir(directory)).toEqual([]);
  });

  it('leaves the next holder its lock when a holder that overran releases', async () => {
    let successorHolds = false;
    let releaseSuccessor = (): void => undefined;
    const successorReleased = new Promise<void>((resolve) => {
      releaseSuccessor = resolve;
    });
    let successor: Promise<void> | undefined;

    await FileLock.hold(lockPath, async () => {
      await LockFiles.ageBeyondStale();
      successor = FileLock.hold(lockPath, async () => {
        successorHolds = true;
        await successorReleased;
      });
      while (!successorHolds) {
        await sleep(2);
      }
    });

    const successorToken = await LockFiles.contents();
    releaseSuccessor();
    await successor;

    expect(successorToken).toMatch(/^[\da-f-]{36}$/);
    expect(await LockFiles.contents()).toBeUndefined();
  });
});

describe('FileLock waiters racing for one stale lock', () => {
  it('leaves a new holder its lock when a waiter acts late on the stale lock it saw', async () => {
    await LockFiles.leaveStale('dead-holder');
    let firstToken: string | undefined;
    let lockAfterLateWaiter: string | undefined;

    await FileLock.hold(lockPath, async () => {
      firstToken = await LockFiles.contents();
      await FileLock.removeIfHeldBy(lockPath, 'dead-holder');
      lockAfterLateWaiter = await LockFiles.contents();
    });

    expect(lockAfterLateWaiter).toBe(firstToken);
    expect(await readdir(directory)).toEqual([]);
  });
});

describe('FileLock timeout', () => {
  it('gives up on a lock another process keeps fresh', async () => {
    await writeFile(lockPath, 'live-holder');
    const keepFresh = setInterval(() => {
      const now = new Date();
      void utimes(lockPath, now, now).catch(() => undefined);
    }, 200);

    try {
      await expect(
        FileLock.hold(lockPath, async () => 'held'),
      ).rejects.toBeInstanceOf(SessionLockTimeoutError);
      expect(await LockFiles.contents()).toBe('live-holder');
    } finally {
      clearInterval(keepFresh);
    }
  }, 10_000);
});
