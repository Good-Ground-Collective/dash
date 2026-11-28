import { z } from 'zod';

import { RelayConfig } from '#src/config/relay-config.js';
import {
  MissionControlRefusedKeyError,
  MissionControlUnavailableError,
} from '#src/errors.js';
import {
  type IngestResult,
  ingestResultsSchema,
} from '#src/services/mission-control-ingest/ingest-result.js';

const errorIdentifierSchema = z.string().regex(/^\w{1,64}$/);

const missionControlIngestPropsSchema = z.object({
  config: z.instanceof(RelayConfig),
  timeoutMs: z.int().positive().default(30_000),
});

export type MissionControlIngestProps = z.input<
  typeof missionControlIngestPropsSchema
>;

/** Sends batches of heartbeats to Mission Control's batch ingest route with the relay's key. */
export class MissionControlIngest {
  private readonly config: RelayConfig;
  private readonly timeoutMs: number;

  constructor(props: MissionControlIngestProps) {
    const valid = missionControlIngestPropsSchema.parse(props);

    this.config = valid.config;
    this.timeoutMs = valid.timeoutMs;
  }

  /**
   * One result per heartbeat, in order. Throws `MissionControlRefusedKeyError` on a 401 or 403,
   * which retrying can't fix, and `MissionControlUnavailableError` for anything worth retrying.
   */
  async send(heartbeats: unknown[]): Promise<IngestResult[]> {
    const response = await this.post(heartbeats);

    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new MissionControlRefusedKeyError({ status: response.status });
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new MissionControlUnavailableError({
        detail: `it answered HTTP ${response.status}`,
      });
    }

    const parsed = ingestResultsSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success || parsed.data.results.length !== heartbeats.length) {
      throw new MissionControlUnavailableError({
        detail: 'its answer did not have one result per heartbeat',
      });
    }
    return parsed.data.results;
  }

  private async post(heartbeats: unknown[]): Promise<Response> {
    try {
      return await fetch(this.config.batchUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ heartbeats }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new MissionControlUnavailableError({
        detail: MissionControlIngest.describe(cause),
        cause,
      });
    }
  }

  /**
   * Built from the error's name and code only: `fetch` messages can quote the request, key included,
   * and the detail ends up in relay.log.
   */
  private static describe(cause: unknown): string {
    const name = errorIdentifierSchema.safeParse(
      cause instanceof Error ? cause.name : undefined,
    ).data;
    const code = errorIdentifierSchema.safeParse(
      cause instanceof Error &&
        cause.cause instanceof Error &&
        'code' in cause.cause
        ? cause.cause.code
        : undefined,
    ).data;
    const reason = [name, code].filter(Boolean).join(', ');
    return reason === ''
      ? 'the request failed'
      : `the request failed (${reason})`;
  }
}
