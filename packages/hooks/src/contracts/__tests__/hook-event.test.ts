import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
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
  static async read(
    file: URL,
  ): Promise<{ command: string; entries: string[] }> {
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
    };
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
