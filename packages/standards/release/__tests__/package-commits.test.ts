import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PackageCommits } from '#release/package-commits.js';

/** A throwaway git repository with one commit outside the package, one inside it, and one at the root. */
class ScratchRepository {
  static readonly ROOT = mkdtempSync(path.join(tmpdir(), 'package-commits-'));
  static readonly COMMITS: {
    hash: string;
    message: string;
    subject: string;
    body: string;
  }[] = [];

  static async create(): Promise<void> {
    ScratchRepository.git('init', '-q');
    await ScratchRepository.commit(
      'apps/web/index.ts',
      'feat(web): app-only feature',
    );
    await ScratchRepository.commit(
      'packages/standards/index.ts',
      'fix(standards): package fix',
    );
    await ScratchRepository.commit(
      'README.md',
      'feat!: root-only breaking change',
    );
  }

  static async remove(): Promise<void> {
    await rm(ScratchRepository.ROOT, { recursive: true, force: true });
  }

  static context(directory: string) {
    return {
      cwd: path.join(ScratchRepository.ROOT, directory),
      commits: ScratchRepository.COMMITS,
      logger: { log: () => {} },
      options: { repositoryUrl: 'https://github.com/example/repo' },
      lastRelease: {},
    };
  }

  private static async commit(file: string, message: string): Promise<void> {
    const absolute = path.join(ScratchRepository.ROOT, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, message);
    ScratchRepository.git('add', '.');
    ScratchRepository.git(
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      message,
    );
    const hash = ScratchRepository.git('rev-parse', 'HEAD').trim();
    ScratchRepository.COMMITS.push({
      hash,
      message,
      subject: message,
      body: '',
    });
  }

  private static git(...args: string[]): string {
    return execFileSync('git', args, {
      cwd: ScratchRepository.ROOT,
    }).toString();
  }
}

beforeAll(async () => {
  await ScratchRepository.create();
});

afterAll(async () => {
  await ScratchRepository.remove();
});

describe('PackageCommits', () => {
  it('keeps only the commits that touch the package directory', async () => {
    const { commits } = await PackageCommits.filter(
      ScratchRepository.context('packages/standards'),
    );

    expect(commits.map((commit) => commit.subject)).toEqual([
      'fix(standards): package fix',
    ]);
  });

  it('bases the release type on package commits only', async () => {
    const releaseType = await PackageCommits.analyzeCommits(
      { preset: 'conventionalcommits' },
      ScratchRepository.context('packages/standards'),
    );

    expect(releaseType).toBe('patch');
  });

  it('writes notes from package commits only', async () => {
    const context = {
      ...ScratchRepository.context('packages/standards'),
      nextRelease: { version: '1.0.1', gitTag: 'standards-v1.0.1' },
    };
    const notes = await PackageCommits.generateNotes(
      { preset: 'conventionalcommits' },
      context,
    );

    expect(notes).toContain('package fix');
    expect(notes).not.toContain('app-only feature');
    expect(notes).not.toContain('root-only breaking change');
  });

  it('finds no release when no commit touches the package', async () => {
    await mkdir(path.join(ScratchRepository.ROOT, 'packages/other'), {
      recursive: true,
    });
    const releaseType = await PackageCommits.analyzeCommits(
      { preset: 'conventionalcommits' },
      ScratchRepository.context('packages/other'),
    );

    expect(releaseType).toBeNull();
  });

  it('refuses a context without a working directory', async () => {
    await expect(
      PackageCommits.filter({ ...ScratchRepository.context('.'), cwd: '' }),
    ).rejects.toThrow();
  });
});
