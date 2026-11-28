import { text } from 'node:stream/consumers';

import { HooksConfig } from '#src/config/hooks-config.js';
import { RelayConfig } from '#src/config/relay-config.js';
import { ClaudeCodeHeartbeatHook } from '#src/services/heartbeat-hook/heartbeat-hook.js';
import { FileHookLog } from '#src/services/hook-log/hook-log.js';
import { RelayLauncher } from '#src/services/relay-launcher/relay-launcher.js';

/**
 * The `dash-hooks <event>` command Claude Code runs for each hook. It always exits 0 and prints
 * nothing. After writing a heartbeat it starts the relay if none is running. `dash-hooks relay`
 * runs the relay itself.
 */
export class DashHooksCommand {
  /** A hook that is still running after this long gives up, so a stuck disk can't hold up the agent's turn. */
  static readonly DEADLINE_MS = 5_000;

  static async main(args: readonly string[]): Promise<void> {
    if (args[0] === 'relay') {
      const relay = await import('#src/cli/relay-command.js');
      await relay.RelayCommand.main();
      return;
    }

    setTimeout(() => process.exit(0), DashHooksCommand.DEADLINE_MS).unref();

    try {
      const stdin = process.stdin.isTTY ? '' : await text(process.stdin);
      const config = HooksConfig.fromEnvironment();
      const hook = new ClaudeCodeHeartbeatHook({ config });
      const heartbeat = await hook.handle({
        command: args[0],
        stdin,
        now: new Date(),
      });
      if (heartbeat !== undefined) {
        await DashHooksCommand.startRelay(config);
      }
    } catch (cause) {
      DashHooksCommand.logFailure(args[0], cause);
    }

    process.exitCode = 0;
  }

  private static async startRelay(config: HooksConfig): Promise<void> {
    RelayLauncher.startIfNeeded({
      config,
      relayConfig: await RelayConfig.load(),
      executable: process.execPath,
      args: [...process.execArgv, process.argv[1] ?? ''],
    });
  }

  /** Logs a failure the hook couldn't log itself, such as reading stdin or starting the relay. Dropped if even the log path can't be worked out. */
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
