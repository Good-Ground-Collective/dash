const ownerRunId = '0b7d6a1e-2222-4c1a-9a51-2f1f6a3c0001';
const failedRunId = '0b7d6a1e-2222-4c1a-9a51-2f1f6a3c0002';
const freshRunId = '0b7d6a1e-2222-4c1a-9a51-2f1f6a3c0003';

export const regeneratedBriefingId = freshRunId;

/** One paragraph of text segments, links set as Mission Control sets them. */
type StubParagraph = { text: string; href: string | null }[];

/** Briefings as `GET /briefings` sends them. */
export class BriefingsItems {
  static ago(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString();
  }

  static paragraphs(): StubParagraph[] {
    return [
      [
        { text: 'Two things need you today: ', href: null },
        {
          text: 'Add passkey sign-in',
          href: 'https://github.com/acme-labs/api/pull/42',
        },
        { text: ' is waiting on your review, and ', href: null },
        {
          text: 'the nightly build',
          href: 'https://github.com/acme-labs/api/actions/runs/7',
        },
        { text: ' failed.', href: null },
      ],
      [{ text: 'Rook is idle and the Studio bench is quiet.', href: null }],
    ];
  }

  static freshParagraphs(): StubParagraph[] {
    return [
      [
        {
          text: 'Fresh read: the nightly build is green again, and ',
          href: null,
        },
        {
          text: 'Add passkey sign-in',
          href: 'https://github.com/acme-labs/api/pull/42',
        },
        { text: ' still needs you.', href: null },
      ],
    ];
  }

  static run(props: {
    id: string;
    status: 'succeeded' | 'failed' | 'skipped_over_budget';
    finishedMinutesAgo: number;
    paragraphs: StubParagraph[] | null;
    error?: string;
  }) {
    const answered = props.status !== 'skipped_over_budget';
    return {
      id: props.id,
      trigger: 'scheduled',
      status: props.status,
      startedAt: BriefingsItems.ago(props.finishedMinutesAgo + 1),
      finishedAt: BriefingsItems.ago(props.finishedMinutesAgo),
      snapshotAt: answered
        ? BriefingsItems.ago(props.finishedMinutesAgo + 1)
        : null,
      model: answered ? 'writer' : null,
      tokens: { input: 1000, cachedInput: 0, output: 300, reasoning: 0 },
      costUsd: answered ? 0.2 : 0,
      prices: null,
      sourceCounts: answered
        ? {
            objectives: 4,
            reviewRequests: 2,
            myPullRequests: 1,
            failedRuns: 1,
            assignedIssues: 0,
            agents: 3,
            benches: 2,
          }
        : null,
      paragraphs: props.paragraphs,
      unknownRefs: 0,
      error: props.error ?? null,
    };
  }

  static good(minutesAgo: number) {
    return BriefingsItems.run({
      id: ownerRunId,
      status: 'succeeded',
      finishedMinutesAgo: minutesAgo,
      paragraphs: BriefingsItems.paragraphs(),
    });
  }

  static fresh() {
    return BriefingsItems.run({
      id: freshRunId,
      status: 'succeeded',
      finishedMinutesAgo: 0,
      paragraphs: BriefingsItems.freshParagraphs(),
    });
  }

  static failed() {
    return BriefingsItems.run({
      id: failedRunId,
      status: 'failed',
      finishedMinutesAgo: 5,
      paragraphs: null,
      error: 'The writer timed out.',
    });
  }

  static skipped() {
    return BriefingsItems.run({
      id: failedRunId,
      status: 'skipped_over_budget',
      finishedMinutesAgo: 5,
      paragraphs: null,
    });
  }

  static budget(props: { spentUsd: number; reached: boolean }) {
    return {
      month: '2026-11',
      spentUsd: props.spentUsd,
      capUsd: 100,
      reached: props.reached,
    };
  }
}
