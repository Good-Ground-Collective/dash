import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { hookCommands } from '#src/contracts/hook-event.js';

const hooksFileSchema = z.object({
  hooks: z.record(
    z.string(),
    z.array(
      z.object({
        matcher: z.string().optional(),
        hooks: z.array(
          z.object({
            type: z.literal('command'),
            command: z.string(),
            args: z.array(z.string()),
          }),
        ),
      }),
    ),
  ),
});

class Registrations {
  static readonly PACKAGE = new URL(
    '../../../hooks/hooks.json',
    import.meta.url,
  );
  static readonly PLUGIN = new URL(
    '../../../../../plugins/dash-heartbeats/hooks/hooks.json',
    import.meta.url,
  );

  /** Each registered event with its matcher and the dash-hooks subcommand it runs. */
  static async read(file: URL): Promise<{
    command: string;
    entries: string[];
    invocations: { command: string; args: string[] }[];
  }> {
    const { hooks } = hooksFileSchema.parse(
      JSON.parse(await readFile(file, 'utf8')),
    );
    const handlers = Object.entries(hooks).flatMap(([event, groups]) =>
      groups.flatMap((group) =>
        group.hooks.map((handler) => ({
          event,
          matcher: group.matcher ?? '*',
          handler,
        })),
      ),
    );

    return {
      command: [
        ...new Set(handlers.map(({ handler }) => handler.command)),
      ].join(','),
      entries: handlers
        .map(
          ({ event, matcher, handler }) =>
            `${event} ${matcher} ${handler.args.join(' ')}`,
        )
        .sort(),
      invocations: handlers.map(({ handler }) => handler),
    };
  }
}

const pluginRoot = fileURLToPath(
  new URL('../../../../../plugins/dash-heartbeats', import.meta.url),
);

const stubScript = '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$STUB_RECORD"\n';

/**
 * Runs registered hook commands the way Claude Code runs a command hook with `args`: `command` is
 * spawned directly with `args` as its argument vector, no shell, after `${CLAUDE_PLUGIN_ROOT}` is
 * substituted. A stub `dash-hooks` records the arguments it receives.
 */
class ExecForm {
  readonly directory = mkdtempSync(path.join(tmpdir(), 'dash-exec-'));
  readonly record = path.join(this.directory, 'record.txt');
  readonly pluginData = path.join(this.directory, 'plugin-data');
  readonly binDirectory = path.join(this.directory, 'bin');

  /** A `dash-hooks` stub on `PATH`, and one already installed in the plugin's data directory at the pinned version. */
  async prepare(): Promise<void> {
    const installedBin = path.join(this.pluginData, 'node_modules', '.bin');
    await mkdir(installedBin, { recursive: true });
    await mkdir(this.binDirectory, { recursive: true });
    await copyFile(
      path.join(pluginRoot, 'package.json'),
      path.join(this.pluginData, 'package.json'),
    );
    for (const stub of [installedBin, this.binDirectory]) {
      await writeFile(path.join(stub, 'dash-hooks'), stubScript);
      await chmod(path.join(stub, 'dash-hooks'), 0o755);
    }
  }

  async run(invocation: { command: string; args: string[] }): Promise<void> {
    await promisify(execFile)(
      invocation.command.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot),
      invocation.args,
      {
        env: {
          PATH: `${this.binDirectory}:/usr/bin:/bin`,
          CLAUDE_PLUGIN_ROOT: pluginRoot,
          CLAUDE_PLUGIN_DATA: this.pluginData,
          STUB_RECORD: this.record,
        },
      },
    );
  }

  async received(): Promise<string[]> {
    const text = await readFile(this.record, 'utf8').catch(() => '');
    return text.split('\n').filter((line) => line !== '');
  }

  async remove(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true });
  }
}

describe('hook registration', () => {
  it('registers every event dash-hooks handles, each with its own subcommand', async () => {
    const { command, entries } = await Registrations.read(
      Registrations.PACKAGE,
    );

    expect(command).toBe('dash-hooks');
    expect(entries.map((entry) => entry.split(' ')[0]).sort()).toEqual(
      Object.values(hookCommands).sort(),
    );
    for (const [subcommand, event] of Object.entries(hookCommands)) {
      expect(
        entries.some(
          (entry) =>
            entry.startsWith(`${event} `) && entry.endsWith(` ${subcommand}`),
        ),
      ).toBe(true);
    }
  });

  it('registers the same events and matchers in the Claude Code plugin', async () => {
    const plugin = await Registrations.read(Registrations.PLUGIN);
    const npm = await Registrations.read(Registrations.PACKAGE);

    expect(plugin.command).toBe('${CLAUDE_PLUGIN_ROOT}/scripts/dash-hooks.sh');
    expect(plugin.entries).toEqual(npm.entries);
  });
});

describe('hook commands as Claude Code runs them', () => {
  let exec: ExecForm;

  beforeEach(async () => {
    exec = new ExecForm();
    await exec.prepare();
  });

  afterEach(async () => {
    await exec.remove();
  });

  it.each([
    ['the npm package', Registrations.PACKAGE],
    ['the Claude Code plugin', Registrations.PLUGIN],
  ])('hands dash-hooks its subcommand from %s', async (_name, file) => {
    const { invocations } = await Registrations.read(file);

    for (const invocation of invocations) {
      await exec.run(invocation);
    }

    expect(await exec.received()).toEqual(
      invocations.map(({ args }) => args.join(' ')),
    );
    expect((await exec.received()).sort()).toEqual(
      Object.keys(hookCommands).sort(),
    );
  });
});
