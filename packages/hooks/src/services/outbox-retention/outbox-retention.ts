import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type { HooksConfig } from '#src/config/hooks-config.js';
import { OutboxRetentionError } from '#src/errors.js';
import { RelayCursorStore } from '#src/services/relay-cursor-store/relay-cursor-store.js';

type PruneFailure = { file: string; cause: unknown };
type PruneResult = { removed: string[]; failures: PruneFailure[] };

/**
 * Deletes outbox and session files nobody has written to for longer than the configured retention.
 * An outbox's relay cursor goes first, so a session resumed later, whose new outbox may reuse the old
 * file's inode, is relayed from its start.
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
  }): Promise<PruneResult> {
    const { directory, extension, cutoffMs, beforeRemove } = props;
    const names = await readdir(directory).catch(() => []);
    const result: PruneResult = { removed: [], failures: [] };

    for (const name of names.filter((entry) => entry.endsWith(extension))) {
      const file = path.join(directory, name);
      const modified = await stat(file).then(
        (stats) => stats.mtimeMs,
        () => Number.POSITIVE_INFINITY,
      );
      if (modified < cutoffMs) {
        try {
          await beforeRemove?.(name.slice(0, -extension.length));
          await rm(file, { force: true });
          result.removed.push(file);
        } catch (cause) {
          result.failures.push({ file, cause });
        }
      }
    }

    return result;
  }
}
