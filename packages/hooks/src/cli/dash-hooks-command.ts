import { text } from 'node:stream/consumers';

import { HooksConfig } from '#src/config/hooks-config.js';
import { ClaudeCodeHeartbeatHook } from '#src/services/heartbeat-hook/heartbeat-hook.js';
import { FileHookLog } from '#src/services/hook-log/hook-log.js';

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
    } catch (cause) {
      DashHooksCommand.logFailure(args[0], cause);
    }

    process.exitCode = 0;
  }

  /** Logs a failure from before the hook could log it itself, such as reading stdin. Dropped if even the log path can't be worked out. */
  private static logFailure(event: string | undefined, cause: unknown): void {
    try {
      new FileHookLog({
        logPath: HooksConfig.fromEnvironment().logPath,
      }).failure({ event: event ?? '', cause, now: new Date() });
    } catch {
      return;
    }
  }
}
