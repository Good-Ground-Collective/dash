import { HooksConfig } from '#src/config/hooks-config.js';
import { RelayConfig } from '#src/config/relay-config.js';
import { RelayNotConfiguredError } from '#src/errors.js';
import { OutboxHeartbeatRelay } from '#src/services/heartbeat-relay/heartbeat-relay.js';
import { FileHookLog } from '#src/services/hook-log/hook-log.js';

/**
 * `dash-hooks relay`: sends the outbox to Mission Control until it is drained and quiet, then exits.
 * Hooks start it in the background; it can also be run by hand. Problems go to `relay.log` in the
 * state directory. It exits 1 when it can't relay at all: no configuration, or a refused key.
 */
export class RelayCommand {
  static async main(): Promise<void> {
    const config = HooksConfig.fromEnvironment();

    try {
      const relayConfig = await RelayConfig.load();
      if (relayConfig === undefined) {
        throw new RelayNotConfiguredError({
          configPath: RelayConfig.configPath(),
        });
      }

      const outcome = await new OutboxHeartbeatRelay({
        config,
        relayConfig,
      }).run();
      process.exitCode = outcome === 'halted' ? 1 : 0;
    } catch (cause) {
      new FileHookLog({ logPath: config.relayLogPath }).failure({
        event: 'relay',
        cause,
        now: new Date(),
      });
      process.exitCode = 1;
    }
  }
}
