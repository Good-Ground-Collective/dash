import { randomUUID } from 'node:crypto';
import { link, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { z } from 'zod';

import { SessionLockTimeoutError } from '#src/errors.js';

const fileLockPropsSchema = z.object({
  lockPath: z.string().min(1),
  staleMs: z
    .int()
    .positive()
    .default(2_000)
    .describe(
      'A lock whose file is older than this belongs to a process that died holding it.',
    ),
  timeoutMs: z.int().positive().default(2_500),
});

export type FileLockProps = z.input<typeof fileLockPropsSchema>;

/**
 * A lock file shared by separate hook processes. Each holder writes its own random token into the
 * lock, and the file is created with `link`, which fails if it exists, so only one process holds it
 * at a time. A lock older than `staleMs` belongs to a process that died holding it, such as a hook
 * Claude Code killed at its timeout, and is taken over.
 *
 * Removing a lock, on release or takeover, first renames it to a name only the remover knows, which
 * only one process can do, and deletes it only if it holds the expected token. Otherwise it puts
 * the lock back, so a holder never deletes a lock another process acquired after it.
 */
export class FileLock {
  private readonly lockPath: string;
  private readonly staleMs: number;
  private readonly timeoutMs: number;

  constructor(props: FileLockProps) {
    const valid = fileLockPropsSchema.parse(props);

    this.lockPath = valid.lockPath;
    this.staleMs = valid.staleMs;
    this.timeoutMs = valid.timeoutMs;
  }

  async hold<T>(work: () => Promise<T>): Promise<T> {
    const token = randomUUID();

    await this.acquire(token);
    try {
      return await work();
    } finally {
      await this.removeIfHeldBy(token);
    }
  }

  /**
   * Removes the lock if it holds `token`. A waiter takes over a stale lock with the token it saw
   * there, so if another waiter took the lock over first, the new holder's lock is put back.
   */
  async removeIfHeldBy(token: string): Promise<void> {
    const claimed = `${this.lockPath}.${randomUUID()}.claimed`;
    try {
      await rename(this.lockPath, claimed);
    } catch (error) {
      if (FileLock.hasCode(error, 'ENOENT')) {
        return;
      }
      throw error;
    }

    try {
      if ((await readFile(claimed, 'utf8')) !== token) {
        await this.restore(claimed);
      }
    } finally {
      await rm(claimed, { force: true });
    }
  }

  private async acquire(token: string): Promise<void> {
    const started = Date.now();

    for (let attempt = 0; ; attempt += 1) {
      if (await this.tryCreate(token)) {
        return;
      }
      await this.takeOverIfStale();

      const waitedMs = Date.now() - started;
      if (waitedMs > this.timeoutMs) {
        throw new SessionLockTimeoutError({
          lockPath: this.lockPath,
          waitedMs,
        });
      }
      await sleep(Math.min(2 + attempt, 20) + Math.random() * 3);
    }
  }

  /** Writes the token beside the lock and links it into place, so the lock never exists without its token. */
  private async tryCreate(token: string): Promise<boolean> {
    const pending = `${this.lockPath}.${token}.pending`;

    try {
      await writeFile(pending, token);
      await link(pending, this.lockPath);
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
  private async takeOverIfStale(): Promise<void> {
    let token: string;
    let mtimeMs: number;
    try {
      const handle = await open(this.lockPath, 'r');
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

    if (Date.now() - mtimeMs > this.staleMs) {
      await this.removeIfHeldBy(token);
    }
  }

  /** Puts back a lock claimed from another holder, unless a new lock already took its place. */
  private async restore(claimed: string): Promise<void> {
    try {
      await link(claimed, this.lockPath);
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
