import { stat } from 'node:fs/promises';

import { type MockInstance, vi } from 'vitest';

import type { FakeIngest } from '#src/__tests__/support/fake-ingest.js';
import { FakeTimers } from '#src/__tests__/support/fake-timers.js';
import type { ScratchState } from '#src/__tests__/support/scratch-state.js';
import {
  OutboxHeartbeatRelay,
  type RelayOutcome,
} from '#src/services/heartbeat-relay/heartbeat-relay.js';

interface RelayBinding {
  state?: ScratchState;
  ingest?: FakeIngest;
  runs: Promise<RelayOutcome>[];
}

/** Relays against the fake ingest, each tracked so teardown waits for it before removing the state. */
export class TestRelay {
  static readonly POLL_MS = 7;
  static readonly MIN_BACKOFF_MS = 10;
  static readonly MAX_BACKOFF_MS = 40;

  private static readonly BOUND: RelayBinding = { runs: [] };

  /** Points the relays at this test's state and ingest, and forgets the previous test's runs. */
  static bind(props: { state: ScratchState; ingest: FakeIngest }): void {
    TestRelay.BOUND.state = props.state;
    TestRelay.BOUND.ingest = props.ingest;
    TestRelay.BOUND.runs = [];
  }

  /** Settles once every relay started since `bind` has finished, however it finished. */
  static settled(): Promise<PromiseSettledResult<RelayOutcome>[]> {
    return Promise.allSettled(TestRelay.BOUND.runs);
  }

  static start(): Promise<RelayOutcome> {
    const { state, ingest } = TestRelay.BOUND;
    if (state === undefined || ingest === undefined) {
      throw new Error('TestRelay.bind must run before a relay starts');
    }

    const running = new OutboxHeartbeatRelay({
      config: state.config,
      relayConfig: state.relayConfig(ingest.url),
      pollMs: TestRelay.POLL_MS,
      minBackoffMs: TestRelay.MIN_BACKOFF_MS,
      maxBackoffMs: TestRelay.MAX_BACKOFF_MS,
    }).run();
    TestRelay.BOUND.runs.push(running);
    return running;
  }

  static spyOnBackoff(): MockInstance<(failures: number) => number> {
    // SAFETY: `backoffMs` is a private method of the relay with exactly this signature.
    // eslint-disable-next-line preflight/no-chained-type-assertions -- reaching a private method needs the cast through unknown
    const relay = OutboxHeartbeatRelay.prototype as unknown as {
      backoffMs: (failures: number) => number;
    };
    return vi.spyOn(relay, 'backoffMs');
  }

  static run(): Promise<RelayOutcome> {
    return FakeTimers.runUntil(TestRelay.start());
  }

  static seqsUpTo(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index);
  }

  static async exists(file: string): Promise<boolean> {
    return stat(file).then(
      () => true,
      () => false,
    );
  }
}
