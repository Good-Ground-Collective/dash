import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type { HooksConfig } from '#src/config/hooks-config.js';
import { OutboxRetentionError } from '#src/errors.js';
import { FileLock } from '#src/services/file-lock/file-lock.js';
import { RelayCursorStore } from '#src/services/relay-cursor-store/relay-cursor-store.js';

type PruneFailure = { file: string; cause: unknown };
type PruneResult = { removed: string[]; failures: PruneFailure[] };

/**
 * Deletes outbox and session files nobody has written to for longer than the configured retention.
 * An outbox's relay cursor goes first, so a session resumed later, whose new outbox may reuse the old
 * file's inode, is relayed from its start. Both go under the session's own lock, the one the hooks and
 * the relay write under, and only if the outbox is still unwritten-to once the lock is held.
 */
export class OutboxRetention {
  static readonly DAY_MS = 24 * 60 * 60 * 1000;

  /**
   * Runs on SessionStart, which fires once per session, so the cost isn't paid on every tool call.
   * An entry that can't be deleted doesn't stop the rest; failures are thrown together at the end.
   */
  static async prune(config: HooksConfig, now: Date): Promise<string[]> {
    const outbox = await OutboxRetention.pruneDirectory({
      directory: config.outboxDirectory,
      extension: '.jsonl',
      cutoffMs:
        now.getTime() - config.outboxRetentionDays * OutboxRetention.DAY_MS,
      beforeRemove: (stem) =>
        RelayCursorStore.remove(config.relayCursorsDirectory, stem),
      lockPathFor: (stem) =>
        path.join(config.sessionsDirectory, `${stem}.json.lock`),
    });
    const sessions = await OutboxRetention.pruneDirectory({
      directory: config.sessionsDirectory,
      extension: '.json',
      cutoffMs:
        now.getTime() - config.sessionRetentionDays * OutboxRetention.DAY_MS,
    });

    const failures = [...outbox.failures, ...sessions.failures];
    if (failures.length > 0) {
      throw new OutboxRetentionError({ failures });
    }

    return [...outbox.removed, ...sessions.removed];
  }

  private static async pruneDirectory(props: {
    directory: string;
    extension: string;
    cutoffMs: number;
    beforeRemove?: (stem: string) => Promise<void>;
    lockPathFor?: (stem: string) => string;
  }): Promise<PruneResult> {
    const { directory, extension, cutoffMs, beforeRemove, lockPathFor } = props;
    const names = await readdir(directory).catch(() => []);
    const result: PruneResult = { removed: [], failures: [] };

    for (const name of names.filter((entry) => entry.endsWith(extension))) {
      const file = path.join(directory, name);
      const stem = name.slice(0, -extension.length);
      const isExpired = async (): Promise<boolean> => {
        const modified = await stat(file).then(
          (stats) => stats.mtimeMs,
          () => Number.POSITIVE_INFINITY,
        );
        return modified < cutoffMs;
      };

      if (await isExpired()) {
        try {
          const remove = async (): Promise<boolean> => {
            if (lockPathFor !== undefined && !(await isExpired())) {
              return false;
            }
            await beforeRemove?.(stem);
            await rm(file, { force: true });
            return true;
          };

          const removed =
            lockPathFor === undefined
              ? await remove()
              : await OutboxRetention.holdLock(lockPathFor(stem), remove);
          if (removed) {
            result.removed.push(file);
          }
        } catch (cause) {
          result.failures.push({ file, cause });
        }
      }
    }

    return result;
  }

  /** Creates the lock's directory first, so an outbox whose session state is gone can still be pruned. */
  private static async holdLock<T>(
    lockPath: string,
    work: () => Promise<T>,
  ): Promise<T> {
    await mkdir(path.dirname(lockPath), { recursive: true });
    return new FileLock({ lockPath }).hold(work);
  }
}
