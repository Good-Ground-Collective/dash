import type { BriefingRun } from '#src/briefing/contracts/briefings.ts';
import type {
  BriefingRepository,
  NewBriefingRun,
} from '#src/briefing/repositories/briefings/briefing-repository.ts';
import type { OwnerTimeZoneReader } from '#src/briefing/repositories/owner-time-zones/owner-time-zone-reader.ts';

const microUsdPerUsd = 1_000_000;

/** A run kept with the person it belongs to and its cost in micro-USD. */
export interface StoredBriefing {
  userId: string;
  startedAt: Date;
  costMicroUsd: number;
  run: BriefingRun;
}

/** Holds runs in an array tests can read and backdate. */
export class InMemoryBriefingRepository implements BriefingRepository {
  readonly briefings: StoredBriefing[] = [];
  private nextId = 1;

  async record(run: NewBriefingRun): Promise<BriefingRun> {
    const stored: BriefingRun = {
      id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`,
      trigger: run.trigger,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt.toISOString(),
      snapshotAt: run.snapshotAt?.toISOString() ?? null,
      model: run.model,
      tokens: run.tokens,
      costUsd: run.costMicroUsd / microUsdPerUsd,
      prices: run.prices,
      sourceCounts: run.sourceCounts,
      paragraphs: run.paragraphs,
      unknownRefs: run.unknownRefs,
      error: run.error,
    };
    this.briefings.push({
      userId: run.userId,
      startedAt: run.startedAt,
      costMicroUsd: run.costMicroUsd,
      run: stored,
    });
    return stored;
  }

  async latestSucceeded(props: {
    userId: string;
  }): Promise<BriefingRun | null> {
    const [latest] = (await this.history({ ...props, limit: 1000 })).filter(
      ({ status }) => status === 'succeeded',
    );
    return latest ?? null;
  }

  async latestRun(props: { userId: string }): Promise<BriefingRun | null> {
    const [latest] = await this.history({ ...props, limit: 1 });
    return latest ?? null;
  }

  async history(props: {
    userId: string;
    limit: number;
  }): Promise<BriefingRun[]> {
    return this.briefings
      .filter(({ userId }) => userId === props.userId)
      .toSorted(
        (left, right) =>
          right.startedAt.getTime() - left.startedAt.getTime() ||
          right.run.id.localeCompare(left.run.id),
      )
      .slice(0, props.limit)
      .map(({ run }) => run);
  }

  async spentSince(props: { since: Date }): Promise<number> {
    return this.briefings
      .filter(({ startedAt }) => startedAt >= props.since)
      .reduce((total, { costMicroUsd }) => total + costMicroUsd, 0);
  }

  async runsSince(props: { since: Date }): Promise<number> {
    return this.briefings.filter(
      ({ startedAt, run }) =>
        startedAt >= props.since && run.status !== 'skipped_over_budget',
    ).length;
  }

  async deleteStartedBefore(props: { cutoff: Date }): Promise<number> {
    const kept = this.briefings.filter(
      ({ startedAt }) => startedAt >= props.cutoff,
    );
    const deleted = this.briefings.length - kept.length;
    this.briefings.splice(0, this.briefings.length, ...kept);
    return deleted;
  }
}

/** An owner whose zone a test sets. */
export class FixedOwnerTimeZone implements OwnerTimeZoneReader {
  private readonly timeZone: string;

  constructor(props: { timeZone: string }) {
    this.timeZone = props.timeZone;
  }

  async zone(): Promise<string> {
    return this.timeZone;
  }
}
