import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type { HooksConfig } from '#src/config/hooks-config.js';

/** Deletes outbox and session files nobody has written to for longer than the configured retention. */
export class OutboxRetention {
  static readonly DAY_MS = 24 * 60 * 60 * 1000;

  /** Runs on SessionStart, which fires once per session, so the cost isn't paid on every tool call. */
  static async prune(config: HooksConfig, now: Date): Promise<string[]> {
    const outbox = await OutboxRetention.pruneDirectory(
      config.outboxDirectory,
      '.jsonl',
      now.getTime() - config.outboxRetentionDays * OutboxRetention.DAY_MS,
    );
    const sessions = await OutboxRetention.pruneDirectory(
      config.sessionsDirectory,
      '.json',
      now.getTime() - config.sessionRetentionDays * OutboxRetention.DAY_MS,
    );

    return [...outbox, ...sessions];
  }

  private static async pruneDirectory(
    directory: string,
    extension: string,
    cutoffMs: number,
  ): Promise<string[]> {
    const names = await readdir(directory).catch(() => []);
    const removed: string[] = [];

    for (const name of names.filter((entry) => entry.endsWith(extension))) {
      const file = path.join(directory, name);
      const modified = await stat(file).then(
        (stats) => stats.mtimeMs,
        () => Number.POSITIVE_INFINITY,
      );
      if (modified < cutoffMs) {
        await rm(file, { force: true });
        removed.push(file);
      }
    }

    return removed;
  }
}
