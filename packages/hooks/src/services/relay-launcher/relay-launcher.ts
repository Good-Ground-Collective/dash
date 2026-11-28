import { spawn } from 'node:child_process';

import type { HooksConfig } from '#src/config/hooks-config.js';
import type { RelayConfig } from '#src/config/relay-config.js';
import { RelayHaltRecord } from '#src/services/relay-halt-record/relay-halt-record.js';
import { RelayLock } from '#src/services/relay-lock/relay-lock.js';

/** What a hook did about the relay after writing its heartbeat. */
export type RelayLaunch = 'unconfigured' | 'halted' | 'running' | 'started';

/**
 * Starts a detached relay from a hook when none is running, so nothing extra has to be installed.
 * Two hooks may both start one; the relay's own lock lets one run and the other exit at once.
 */
export class RelayLauncher {
  /**
   * `executable` and `args` are how this process was started, such as `node --flags dash-hooks.js`;
   * the relay adds `relay` to them, so it runs the same build with the same Node options.
   */
  static startIfNeeded(props: {
    config: HooksConfig;
    relayConfig: RelayConfig | undefined;
    executable: string;
    args: readonly string[];
  }): RelayLaunch {
    const { config, relayConfig } = props;

    if (relayConfig === undefined) {
      return 'unconfigured';
    }
    if (
      RelayHaltRecord.isHalted(config.relayHaltPath, relayConfig.fingerprint)
    ) {
      return 'halted';
    }
    if (new RelayLock({ pidPath: config.relayPidPath }).isHeld()) {
      return 'running';
    }

    const relay = spawn(props.executable, [...props.args, 'relay'], {
      cwd: config.stateDirectory,
      detached: true,
      stdio: 'ignore',
    });
    relay.on('error', () => undefined);
    relay.unref();
    return 'started';
  }
}
