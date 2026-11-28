import { z } from 'zod';
import type {
  BriefingParagraph,
  Briefings,
} from '#lib/api/briefings/briefing-contracts.ts';
import { BriefingWording } from '#lib/briefing/briefing-wording.ts';

/** What home got from Mission Control: the briefings, or `failed` when it didn't answer. */
export type BriefingState =
  { status: 'loaded'; briefings: Briefings } | { status: 'failed' };

/** `empty` is configured with no succeeded briefing yet. */
export type BriefingCardStatus = 'failed' | 'unconfigured' | 'empty' | 'ready';

export interface BriefingSnapshot {
  text: string;
  stale: boolean;
}

export const briefingViewPropsSchema = z.object({
  state: z.custom<BriefingState>(),
  now: z.date(),
});

export type BriefingViewProps = z.input<typeof briefingViewPropsSchema>;

/** Hours after which a snapshot reads as stale. */
const staleAfterMilliseconds = 3 * 60 * 60 * 1000;

/** What the Briefing card shows for the briefings it holds at `now`. */
export class BriefingView {
  private readonly state: BriefingState;
  private readonly now: Date;

  constructor(props: BriefingViewProps) {
    const valid = briefingViewPropsSchema.parse(props);
    this.state = valid.state;
    this.now = valid.now;
  }

  get status(): BriefingCardStatus {
    if (this.state.status === 'failed') return 'failed';
    const { configured, latest } = this.state.briefings;
    if (!configured) return 'unconfigured';
    return latest === null ? 'empty' : 'ready';
  }

  get paragraphs(): BriefingParagraph[] {
    return this.loaded?.latest?.paragraphs ?? [];
  }

  get generated(): string | null {
    const latest = this.loaded?.latest;
    return latest === null || latest === undefined
      ? null
      : BriefingWording.generated(latest.finishedAt);
  }

  get snapshot(): BriefingSnapshot | null {
    const snapshotAt = this.loaded?.latest?.snapshotAt;
    if (snapshotAt === null || snapshotAt === undefined) return null;
    return {
      text: BriefingWording.snapshot(snapshotAt),
      stale: this.now.getTime() - snapshotAt.getTime() > staleAfterMilliseconds,
    };
  }

  get sources(): string[] {
    const counts = this.loaded?.latest?.sourceCounts;
    return counts === null || counts === undefined
      ? []
      : BriefingWording.sources(counts);
  }

  get spend(): string | null {
    return this.loaded === null
      ? null
      : BriefingWording.spend(this.loaded.budget);
  }

  /** Set when a run newer than the shown briefing failed or was skipped. */
  get note(): string | null {
    const { latest, lastRun } = this.loaded ?? { latest: null, lastRun: null };
    if (lastRun === null) return null;
    const newer =
      latest === null ||
      lastRun.finishedAt.getTime() > latest.finishedAt.getTime();
    return newer ? BriefingWording.lastRunNote(lastRun) : null;
  }

  get budgetNote(): string | null {
    return this.loaded?.budget.reached === true
      ? BriefingWording.budgetReached()
      : null;
  }

  get message(): string | null {
    if (this.status === 'failed') return BriefingWording.unavailable();
    if (this.status === 'unconfigured') return BriefingWording.notConfigured();
    if (this.status === 'empty') return BriefingWording.empty();
    return null;
  }

  get canRegenerate(): boolean {
    const briefings = this.loaded;
    return (
      briefings !== null && briefings.configured && !briefings.budget.reached
    );
  }

  /** What Mission Control says is running, for a card that has just loaded or re-read. */
  get running(): Briefings['running'] {
    return this.loaded?.running ?? null;
  }

  private get loaded(): Briefings | null {
    return this.state.status === 'loaded' ? this.state.briefings : null;
  }
}
