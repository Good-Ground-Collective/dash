import { mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkspaceProbe } from '#src/services/workspace-probe/workspace-probe.js';

let root: string;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'workspace-probe-'));
  const git = path.join(root, 'repo', '.git');
  await mkdir(path.join(git, 'worktrees', 'feature'), { recursive: true });
  await writeFile(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
  await writeFile(
    path.join(git, 'config'),
    '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:example/widgets.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n',
  );
  await writeFile(
    path.join(git, 'worktrees', 'feature', 'HEAD'),
    'ref: refs/heads/feat/thing\n',
  );
  await writeFile(
    path.join(git, 'worktrees', 'feature', 'commondir'),
    '../..\n',
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('WorkspaceProbe', () => {
  it('reads the branch and origin repository from a nested directory', async () => {
    const nested = path.join(root, 'repo', 'packages', 'app');
    await mkdir(nested, { recursive: true });

    expect(WorkspaceProbe.describe(nested)).toEqual({
      directory: nested,
      repository: 'example/widgets',
      branch: 'main',
    });
  });

  it('follows a worktree to its own branch and the shared remote', async () => {
    const worktree = path.join(root, 'feature');
    await mkdir(worktree);
    await writeFile(
      path.join(worktree, '.git'),
      `gitdir: ${path.join(root, 'repo', '.git', 'worktrees', 'feature')}\n`,
    );

    expect(WorkspaceProbe.describe(worktree)).toEqual({
      directory: worktree,
      repository: 'example/widgets',
      branch: 'feat/thing',
    });
  });

  it('reports only the directory outside a repository', () => {
    expect(WorkspaceProbe.describe(root)).toEqual({ directory: root });
  });
});
