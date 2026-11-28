import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { HeartbeatPayload } from '#src/services/heartbeat-mapper/heartbeat-plan.js';
import { TextTrimmer } from '#src/services/text-trimmer/text-trimmer.js';

type Workspace = NonNullable<HeartbeatPayload['workspace']>;

/**
 * Works out which repository and branch a working directory is on by reading `.git` files
 * directly. Starting `git` would cost more than the rest of the hook, which runs inline on
 * every heartbeat.
 */
export class WorkspaceProbe {
  static describe(directory: string | undefined): Workspace | undefined {
    if (directory === undefined || directory === '') {
      return undefined;
    }

    const gitDirectory = WorkspaceProbe.findGitDirectory(directory);
    if (gitDirectory === undefined) {
      return { directory: TextTrimmer.trim(directory, 1024) };
    }

    return {
      directory: TextTrimmer.trim(directory, 1024),
      repository: TextTrimmer.trim(
        WorkspaceProbe.repository(gitDirectory),
        256,
      ),
      branch: TextTrimmer.trim(WorkspaceProbe.branch(gitDirectory), 256),
    };
  }

  /** The git directory for `start`, following the `gitdir:` file a worktree or submodule has instead of a folder. */
  private static findGitDirectory(start: string): string | undefined {
    for (let current = start; ; current = path.dirname(current)) {
      const candidate = path.join(current, '.git');
      const kind = WorkspaceProbe.kindOf(candidate);
      if (kind === 'directory') {
        return candidate;
      }
      if (kind === 'file') {
        const pointer = /^gitdir:\s*(.+)$/m.exec(
          WorkspaceProbe.read(candidate) ?? '',
        );
        const target = pointer?.[1]?.trim();
        return target ? path.resolve(current, target) : undefined;
      }
      if (path.dirname(current) === current) {
        return undefined;
      }
    }
  }

  private static branch(gitDirectory: string): string | undefined {
    const head = WorkspaceProbe.read(path.join(gitDirectory, 'HEAD'));
    return /^ref: refs\/heads\/(.+)$/m.exec(head ?? '')?.[1]?.trim();
  }

  /** `owner/name` from the `origin` remote, read from the common git directory a worktree shares with its main checkout. */
  private static repository(gitDirectory: string): string | undefined {
    const commonPointer = WorkspaceProbe.read(
      path.join(gitDirectory, 'commondir'),
    );
    const commonDirectory = commonPointer
      ? path.resolve(gitDirectory, commonPointer.trim())
      : gitDirectory;
    const config =
      WorkspaceProbe.read(path.join(commonDirectory, 'config')) ?? '';

    const origin = /\[remote "origin"\]([^[]*)/.exec(config)?.[1] ?? '';
    const url = /^\s*url\s*=\s*(.+)$/m.exec(origin)?.[1]?.trim() ?? '';
    return /[/:]([^/:]+\/[^/]+?)(?:\.git)?\/?$/.exec(url)?.[1];
  }

  private static kindOf(candidate: string): 'directory' | 'file' | undefined {
    try {
      const stats = statSync(candidate);
      return stats.isDirectory() ? 'directory' : 'file';
    } catch {
      return undefined;
    }
  }

  private static read(file: string): string | undefined {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
  }
}
