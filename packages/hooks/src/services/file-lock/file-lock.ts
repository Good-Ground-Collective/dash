import { open, rm, stat } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { SessionLockTimeoutError } from '#src/errors.js';

/**
 * A lock file shared by separate hook processes. Creating the file with `wx` is atomic, so only
 * one process holds it at a time. A lock older than `staleMs` belongs to a process that died
 * holding it, such as a hook Claude Code killed at its timeout, and is taken over.
 */
export class FileLock {
  static readonly TIMEOUT_MS = 2_500;
  static readonly STALE_MS = 2_000;

  static async hold<T>(lockPath: string, work: () => Promise<T>): Promise<T> {
    await FileLock.acquire(lockPath);
    try {
      return await work();
    } finally {
      await rm(lockPath, { force: true });
    }
  }

  private static async acquire(lockPath: string): Promise<void> {
    const started = Date.now();

    for (let attempt = 0; ; attempt += 1) {
      if (await FileLock.tryCreate(lockPath)) {
        return;
      }
      await FileLock.removeIfStale(lockPath);

      const waitedMs = Date.now() - started;
      if (waitedMs > FileLock.TIMEOUT_MS) {
        throw new SessionLockTimeoutError({ lockPath, waitedMs });
      }
      await sleep(Math.min(2 + attempt, 20) + Math.random() * 3);
    }
  }

  private static async tryCreate(lockPath: string): Promise<boolean> {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(String(process.pid));
      await handle.close();
      return true;
    } catch (error) {
      if (FileLock.hasCode(error, 'EEXIST')) {
        return false;
      }
      throw error;
    }
  }

  private static async removeIfStale(lockPath: string): Promise<void> {
    try {
      const { mtimeMs } = await stat(lockPath);
      if (Date.now() - mtimeMs > FileLock.STALE_MS) {
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if (!FileLock.hasCode(error, 'ENOENT')) {
        throw error;
      }
    }
  }

  private static hasCode(cause: unknown, code: string): boolean {
    return cause instanceof Error && 'code' in cause && cause.code === code;
  }
}
