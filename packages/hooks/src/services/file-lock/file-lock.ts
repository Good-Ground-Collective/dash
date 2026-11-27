import { randomUUID } from 'node:crypto';
import { link, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { SessionLockTimeoutError } from '#src/errors.js';

/**
 * A lock file shared by separate hook processes. Each holder writes its own random token into the
 * lock, and the file is created with `link`, which fails if it exists, so only one process holds it
 * at a time. A lock older than `STALE_MS` belongs to a process that died holding it, such as a hook
 * Claude Code killed at its timeout, and is taken over.
 *
 * Removing a lock, on release or takeover, first renames it to a name only the remover knows, which
 * only one process can do, and deletes it only if it holds the expected token. Otherwise it puts
 * the lock back, so a holder never deletes a lock another process acquired after it.
 */
export class FileLock {
  static readonly TIMEOUT_MS = 2_500;
  static readonly STALE_MS = 2_000;

  static async hold<T>(lockPath: string, work: () => Promise<T>): Promise<T> {
    const token = randomUUID();

    await FileLock.acquire(lockPath, token);
    try {
      return await work();
    } finally {
      await FileLock.removeIfHeldBy(lockPath, token);
    }
  }

  /**
   * Removes the lock if it holds `token`. A waiter takes over a stale lock with the token it saw
   * there, so if another waiter took the lock over first, the new holder's lock is put back.
   */
  static async removeIfHeldBy(lockPath: string, token: string): Promise<void> {
    const claimed = `${lockPath}.${randomUUID()}.claimed`;
    try {
      await rename(lockPath, claimed);
    } catch (error) {
      if (FileLock.hasCode(error, 'ENOENT')) {
        return;
      }
      throw error;
    }

    try {
      if ((await readFile(claimed, 'utf8')) !== token) {
        await FileLock.restore(claimed, lockPath);
      }
    } finally {
      await rm(claimed, { force: true });
    }
  }

  private static async acquire(lockPath: string, token: string): Promise<void> {
    const started = Date.now();

    for (let attempt = 0; ; attempt += 1) {
      if (await FileLock.tryCreate(lockPath, token)) {
        return;
      }
      await FileLock.takeOverIfStale(lockPath);

      const waitedMs = Date.now() - started;
      if (waitedMs > FileLock.TIMEOUT_MS) {
        throw new SessionLockTimeoutError({ lockPath, waitedMs });
      }
      await sleep(Math.min(2 + attempt, 20) + Math.random() * 3);
    }
  }

  /** Writes the token beside the lock and links it into place, so the lock never exists without its token. */
  private static async tryCreate(
    lockPath: string,
    token: string,
  ): Promise<boolean> {
    const pending = `${lockPath}.${token}.pending`;

    try {
      await writeFile(pending, token);
      await link(pending, lockPath);
      return true;
    } catch (error) {
      if (FileLock.hasCode(error, 'EEXIST')) {
        return false;
      }
      throw error;
    } finally {
      await rm(pending, { force: true });
    }
  }

  /** Reads the token and age from one open file, so both describe the same lock. */
  private static async takeOverIfStale(lockPath: string): Promise<void> {
    let token: string;
    let mtimeMs: number;
    try {
      const handle = await open(lockPath, 'r');
      try {
        ({ mtimeMs } = await handle.stat());
        token = await handle.readFile('utf8');
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (FileLock.hasCode(error, 'ENOENT')) {
        return;
      }
      throw error;
    }

    if (Date.now() - mtimeMs > FileLock.STALE_MS) {
      await FileLock.removeIfHeldBy(lockPath, token);
    }
  }

  /** Puts back a lock claimed from another holder, unless a new lock already took its place. */
  private static async restore(
    claimed: string,
    lockPath: string,
  ): Promise<void> {
    try {
      await link(claimed, lockPath);
    } catch (error) {
      if (!FileLock.hasCode(error, 'EEXIST')) {
        throw error;
      }
    }
  }

  private static hasCode(cause: unknown, code: string): boolean {
    return cause instanceof Error && 'code' in cause && cause.code === code;
  }
}
