import { mkdtempSync } from 'node:fs';
import { readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionLockTimeoutError } from '#src/errors.js';
import { FileLock } from '#src/services/file-lock/file-lock.js';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'dash-lock-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/**
 * Lock files on disk, as a dead or overrunning holder would leave them. Each test passes the lock
 * path it captured, so work a timed-out test leaves running never touches a later test's directory.
 */
class LockFiles {
  static pathIn(lockDirectory: string): string {
    return path.join(lockDirectory, 'session.json.lock');
  }

  /** Dates the lock an hour back, far past any stale threshold and any file-time granularity. */
  static async ageBeyondStale(lockPath: string): Promise<void> {
    const past = new Date(Date.now() - 60 * 60 * 1_000);
    await utimes(lockPath, past, past);
  }

  static async leaveStale(lockPath: string, token: string): Promise<void> {
    await writeFile(lockPath, token);
    await LockFiles.ageBeyondStale(lockPath);
  }

  static async contents(lockPath: string): Promise<string | undefined> {
    return readFile(lockPath, 'utf8').catch(() => undefined);
  }
}

describe('FileLock stale takeover', () => {
  it('takes over a lock left behind by a process that died holding it', async () => {
    const lockPath = LockFiles.pathIn(directory);
    await LockFiles.leaveStale(lockPath, 'dead-holder');

    const held = await new FileLock({ lockPath }).hold(async () => 'held');

    expect(held).toBe('held');
    expect(await LockFiles.contents(lockPath)).toBeUndefined();
  });

  it('never lets waiters that all find the same stale lock hold it at once', async () => {
    const lockDirectory = directory;
    const lockPath = LockFiles.pathIn(lockDirectory);
    let active = 0;
    let mostActive = 0;

    for (let round = 0; round < 20; round += 1) {
      await LockFiles.leaveStale(lockPath, 'dead-holder');
      await Promise.all(
        Array.from({ length: 8 }, () =>
          new FileLock({ lockPath }).hold(async () => {
            active += 1;
            mostActive = Math.max(mostActive, active);
            await sleep(1);
            active -= 1;
          }),
        ),
      );
    }

    expect(mostActive).toBe(1);
    expect(await readdir(lockDirectory)).toEqual([]);
  }, 15_000);

  it('leaves the next holder its lock when a holder that overran releases', async () => {
    const lockPath = LockFiles.pathIn(directory);
    let successorHolds = false;
    let releaseSuccessor = (): void => undefined;
    const successorReleased = new Promise<void>((resolve) => {
      releaseSuccessor = resolve;
    });
    let successor: Promise<void> | undefined;

    await new FileLock({ lockPath }).hold(async () => {
      await LockFiles.ageBeyondStale(lockPath);
      successor = new FileLock({ lockPath }).hold(async () => {
        successorHolds = true;
        await successorReleased;
      });
      while (!successorHolds) {
        await sleep(2);
      }
    });

    const successorToken = await LockFiles.contents(lockPath);
    releaseSuccessor();
    await successor;

    expect(successorToken).toMatch(/^[\da-f-]{36}$/);
    expect(await LockFiles.contents(lockPath)).toBeUndefined();
  });
});

describe('FileLock waiters racing for one stale lock', () => {
  it('leaves a new holder its lock when a waiter acts late on the stale lock it saw', async () => {
    const lockDirectory = directory;
    const lockPath = LockFiles.pathIn(lockDirectory);
    const lock = new FileLock({ lockPath });
    await LockFiles.leaveStale(lockPath, 'dead-holder');
    let firstToken: string | undefined;
    let lockAfterLateWaiter: string | undefined;

    await lock.hold(async () => {
      firstToken = await LockFiles.contents(lockPath);
      await lock.removeIfHeldBy('dead-holder');
      lockAfterLateWaiter = await LockFiles.contents(lockPath);
    });

    expect(lockAfterLateWaiter).toBe(firstToken);
    expect(await readdir(lockDirectory)).toEqual([]);
  });
});

describe('FileLock timeout', () => {
  it('gives up on a lock that is not yet stale', async () => {
    const lockPath = LockFiles.pathIn(directory);
    await writeFile(lockPath, 'live-holder');
    const lock = new FileLock({ lockPath, staleMs: 60_000, timeoutMs: 100 });

    await expect(lock.hold(async () => 'held')).rejects.toBeInstanceOf(
      SessionLockTimeoutError,
    );
    expect(await LockFiles.contents(lockPath)).toBe('live-holder');
  });
});
