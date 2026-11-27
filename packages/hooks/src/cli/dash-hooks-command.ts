import { text } from 'node:stream/consumers';

import { HooksConfig } from '#src/config/hooks-config.js';
import { ClaudeCodeHeartbeatHook } from '#src/services/heartbeat-hook/heartbeat-hook.js';

/** The `dash-hooks <event>` command Claude Code runs for each hook. It always exits 0 and prints nothing. */
export class DashHooksCommand {
  /** A hook that is still running after this long gives up, so a stuck disk can't hold up the agent's turn. */
  static readonly DEADLINE_MS = 5_000;

  static async main(args: readonly string[]): Promise<void> {
    setTimeout(() => process.exit(0), DashHooksCommand.DEADLINE_MS).unref();

    try {
      const stdin = process.stdin.isTTY ? '' : await text(process.stdin);
      const hook = new ClaudeCodeHeartbeatHook({
        config: HooksConfig.fromEnvironment(),
      });
      await hook.handle({ command: args[0], stdin, now: new Date() });
    } catch {
      process.exitCode = 0;
    }

    process.exitCode = 0;
  }
}
