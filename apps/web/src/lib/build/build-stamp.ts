import { z } from 'zod';

const repositoryUrl = 'https://github.com/Good-Ground-Collective/dash';
const releaseTagPattern = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const commitPattern = /^[0-9a-f]{7,40}$/iu;

/** Which build is running, as the account menu shows it. Plain data, so the layout load can send it to the browser. */
export const buildStampSchema = z.object({
  version: z
    .string()
    .describe(
      'The release tag, such as `v1.1.1`, or `dev` for a build without one.',
    ),
  releaseUrl: z.url().nullable(),
  shortCommit: z.string().length(7).nullable(),
  commitUrl: z.url().nullable(),
});

export type BuildStamp = z.infer<typeof buildStampSchema>;

/** Reads the `APP_VERSION` and `APP_COMMIT` that `bin/image` bakes into an image. */
export class EnvironmentBuildStamp {
  /** Anything unset, blank or malformed falls back: the version to `dev`, the commit to nothing. */
  static from(env: {
    version?: string | undefined;
    commit?: string | undefined;
  }): BuildStamp {
    const version = env.version?.trim() || 'dev';
    const commit = env.commit?.trim().toLowerCase() ?? '';
    const knownCommit = commitPattern.test(commit) ? commit : null;
    return {
      version,
      releaseUrl: releaseTagPattern.test(version)
        ? `${repositoryUrl}/releases/tag/${version}`
        : null,
      shortCommit: knownCommit?.slice(0, 7) ?? null,
      commitUrl:
        knownCommit === null ? null : `${repositoryUrl}/commit/${knownCommit}`,
    };
  }
}
