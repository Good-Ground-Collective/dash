import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { z } from 'zod';

const pluginConfigSchema = z.looseObject({ preset: z.string().optional() });

const stepContextSchema = z.looseObject({
  cwd: z.string().min(1),
  commits: z.array(z.looseObject({ hash: z.string().min(1) })),
});

const releaseTypeSchema = z
  .enum([
    'major',
    'premajor',
    'minor',
    'preminor',
    'patch',
    'prepatch',
    'prerelease',
  ])
  .nullable();

type PluginConfig = z.input<typeof pluginConfigSchema>;

type ReleaseType = z.output<typeof releaseTypeSchema>;

/** The parts of a semantic-release step context this plugin reads; the real context passes through untouched otherwise. */
interface PackageStepContext {
  cwd?: string;
  commits: readonly { hash: string }[];
  logger: { log: (format: string, ...values: (string | number)[]) => void };
}

interface StockPlugin {
  analyzeCommits?: (
    config: PluginConfig,
    context: PackageStepContext,
  ) => Promise<string | null>;
  generateNotes?: (
    config: PluginConfig,
    context: PackageStepContext,
  ) => Promise<string>;
}

/** A semantic-release plugin that runs the stock commit analyzer and notes generator over only the commits that touch the directory semantic-release runs in. */
export class PackageCommits {
  private static readonly GIT = promisify(execFile);

  private static readonly FROM_SEMANTIC_RELEASE = createRequire(
    createRequire(import.meta.url).resolve('semantic-release'),
  );

  static async analyzeCommits(
    pluginConfig: PluginConfig,
    context: PackageStepContext,
  ): Promise<ReleaseType> {
    const { analyzeCommits } = await PackageCommits.load(
      '@semantic-release/commit-analyzer',
    );
    if (analyzeCommits === undefined) {
      throw new Error(
        '@semantic-release/commit-analyzer has no analyzeCommits step',
      );
    }

    return releaseTypeSchema.parse(
      await analyzeCommits(
        pluginConfigSchema.parse(pluginConfig),
        await PackageCommits.filter(context),
      ),
    );
  }

  static async generateNotes(
    pluginConfig: PluginConfig,
    context: PackageStepContext,
  ): Promise<string> {
    const { generateNotes } = await PackageCommits.load(
      '@semantic-release/release-notes-generator',
    );
    if (generateNotes === undefined) {
      throw new Error(
        '@semantic-release/release-notes-generator has no generateNotes step',
      );
    }

    return z
      .string()
      .parse(
        await generateNotes(
          pluginConfigSchema.parse(pluginConfig),
          await PackageCommits.filter(context),
        ),
      );
  }

  /** Merge commits that only bring in package commits are dropped too, since git log simplifies them away. */
  static async filter<Context extends PackageStepContext>(
    context: Context,
  ): Promise<Context> {
    const { cwd, commits } = stepContextSchema.parse(context);
    const { stdout } = await PackageCommits.GIT(
      'git',
      ['log', '--format=%H', 'HEAD', '--', '.'],
      {
        cwd,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const touching = new Set(stdout.split('\n').filter(Boolean));
    const kept = context.commits.filter((commit) => touching.has(commit.hash));
    context.logger.log(
      'Kept %d of %d commits that touch %s',
      kept.length,
      commits.length,
      cwd,
    );

    return { ...context, commits: kept };
  }

  private static async load(module: string): Promise<StockPlugin> {
    const url = pathToFileURL(
      PackageCommits.FROM_SEMANTIC_RELEASE.resolve(module),
    );

    // SAFETY: both modules are semantic-release's own default plugins, resolved from the installed semantic-release, and export these steps; callers check each step is present before calling it.
    return (await import(url.href)) as StockPlugin;
  }
}

export const analyzeCommits =
  PackageCommits.analyzeCommits.bind(PackageCommits);
export const generateNotes = PackageCommits.generateNotes.bind(PackageCommits);
