import { z } from 'zod';

import { HooksConfig } from '#src/config/hooks-config.js';
import { RelayConfig } from '#src/config/relay-config.js';
import { MissionControlRefusedKeyError } from '#src/errors.js';
import { FileHookLog, type HookLog } from '#src/services/hook-log/hook-log.js';
import { MissionControlIngest } from '#src/services/mission-control-ingest/mission-control-ingest.js';
import { OutboxDelivery } from '#src/services/outbox-delivery/outbox-delivery.js';
import { RelayHaltRecord } from '#src/services/relay-halt-record/relay-halt-record.js';
import { RelayLock } from '#src/services/relay-lock/relay-lock.js';

const outboxHeartbeatRelayPropsSchema = z.object({
  config: z.instanceof(HooksConfig),
  relayConfig: z.instanceof(RelayConfig),
  pollMs: z
    .int()
    .positive()
    .default(1_000)
    .describe('How often a caught-up relay looks for new outbox lines.'),
  minBackoffMs: z.int().positive().default(1_000),
  maxBackoffMs: z
    .int()
    .positive()
    .default(5 * 60_000)
    .describe(
      'The longest wait between attempts while Mission Control is unreachable. The relay keeps trying for as long as it is.',
    ),
});

export type OutboxHeartbeatRelayProps = z.input<
  typeof outboxHeartbeatRelayPropsSchema
>;

/**
 * How a relay run ended: `drained`, every line delivered and nothing new for the idle period;
 * `halted`, Mission Control refused the key; or `busy`, another relay already runs.
 */
export type RelayOutcome = 'drained' | 'halted' | 'busy';

/** Carries heartbeats from the local outbox to Mission Control. */
export interface HeartbeatRelay {
  run(): Promise<RelayOutcome>;
}

/**
 * A relay that runs while there is something to send and exits once the outbox has been drained
 * and quiet for the idle period. One runs per state directory. While Mission Control is unreachable
 * it backs off exponentially, with jitter, up to `maxBackoffMs`, and never drops a heartbeat; a 401
 * or 403 stops it and is remembered until the configuration changes.
 */
export class OutboxHeartbeatRelay implements HeartbeatRelay {
  private readonly config: HooksConfig;
  private readonly relayConfig: RelayConfig;
  private readonly pollMs: number;
  private readonly minBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly log: HookLog;
  private readonly lock: RelayLock;
  private readonly delivery: OutboxDelivery;

  constructor(props: OutboxHeartbeatRelayProps) {
    const valid = outboxHeartbeatRelayPropsSchema.parse(props);

    this.config = valid.config;
    this.relayConfig = valid.relayConfig;
    this.pollMs = valid.pollMs;
    this.minBackoffMs = valid.minBackoffMs;
    this.maxBackoffMs = valid.maxBackoffMs;
    this.log = new FileHookLog({ logPath: valid.config.relayLogPath });
    this.lock = new RelayLock({ pidPath: valid.config.relayPidPath });
    this.delivery = new OutboxDelivery({
      config: valid.config,
      ingest: new MissionControlIngest({ config: valid.relayConfig }),
      log: this.log,
    });
  }

  /**
   * After letting go of the lock it looks once more: a hook that appended while this relay was
   * exiting saw it still running and didn't start another, so its line would otherwise wait.
   */
  async run(): Promise<RelayOutcome> {
    if (this.isHalted()) {
      return 'halted';
    }
    if (!(await this.lock.acquire())) {
      return 'busy';
    }

    for (;;) {
      let outcome: RelayOutcome;
      try {
        outcome = await this.relayUntilIdle();
      } finally {
        await this.lock.release();
      }

      const more =
        outcome === 'drained' && (await this.delivery.hasUndelivered());
      if (!more || !(await this.lock.acquire())) {
        return outcome;
      }
    }
  }

  private async relayUntilIdle(): Promise<'drained' | 'halted'> {
    let quietSince = Date.now();
    let failures = 0;

    for (;;) {
      try {
        if (await this.delivery.deliverAll()) {
          quietSince = Date.now();
        } else if (Date.now() - quietSince >= this.relayConfig.idleExitMs) {
          return 'drained';
        }
        failures = 0;
        await OutboxHeartbeatRelay.sleep(this.pollMs);
      } catch (cause) {
        if (cause instanceof MissionControlRefusedKeyError) {
          await this.halt(cause);
          return 'halted';
        }
        if (failures === 0) {
          this.log.failure({ event: 'relay', cause, now: new Date() });
        }
        failures += 1;
        await OutboxHeartbeatRelay.sleep(this.backoffMs(failures));
      }
    }
  }

  private async halt(cause: MissionControlRefusedKeyError): Promise<void> {
    const now = new Date();
    this.log.failure({ event: 'relay', cause, now });
    await RelayHaltRecord.record({
      haltPath: this.config.relayHaltPath,
      fingerprint: this.relayConfig.fingerprint,
      status: cause.status,
      now,
    });
  }

  private isHalted(): boolean {
    return RelayHaltRecord.isHalted(
      this.config.relayHaltPath,
      this.relayConfig.fingerprint,
    );
  }

  /** Doubles from `minBackoffMs` with each failure in a row, capped, and spread by up to half so relays don't retry in step. */
  private backoffMs(failures: number): number {
    const ceiling = Math.min(
      this.maxBackoffMs,
      this.minBackoffMs * 2 ** Math.min(failures - 1, 30),
    );
    return Math.round(ceiling * (0.5 + Math.random() / 2));
  }

  /** The global `setTimeout`, so tests can drive polls and backoff with fake timers. */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
