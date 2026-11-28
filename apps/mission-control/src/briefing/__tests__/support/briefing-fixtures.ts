import type {
  Activity,
  ActivityPullRequest,
  TrackerSnapshot,
} from '@dash/integrations-core';

import { GithubFeedFixtures } from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { ObjectivesFixtures } from '#src/objectives/__tests__/support/objectives-fixtures.ts';

export const longTitle = `${'A long provider title. '.repeat(20)}`;

/** Trackers and GitHub activity with as many items as a test asks for. */
export class BriefingFixtures {
  /** `initiatives` open initiatives, each holding `epics` epics, all with titles of `title`. */
  static tracker(props: {
    initiatives: number;
    epics: number;
    title?: string;
  }): TrackerSnapshot {
    const { initiative, epic } = ObjectivesFixtures;
    const title = props.title ?? 'Objective';
    const initiatives = Array.from({ length: props.initiatives }, (_, index) =>
      initiative({ externalId: `PVT_${index}`, title: `${title} ${index}` }),
    );
    const epics = initiatives.flatMap((parent, parentIndex) =>
      Array.from({ length: props.epics }, (_, index) =>
        epic({
          externalId: `E_${parentIndex}_${index}`,
          title: `${title} ${parentIndex}.${index}`,
          initiativeIds: [parent.externalId],
        }),
      ),
    );
    return {
      initiatives,
      epics,
      tickets: [],
      activity: [],
      truncated: false,
    };
  }

  /** The given number of review requests, quiet and problem pull requests of mine, failed runs and issues, all titled `title`. */
  static activity(props: {
    reviewRequests: number;
    quietPullRequests: number;
    problemPullRequests: number;
    failedRuns: number;
    issues: number;
    title?: string;
  }): Activity {
    const title = props.title ?? 'Change';
    const numbered = (count: number, offset: number) =>
      Array.from({ length: count }, (_, index) => offset + index);
    return {
      ...GithubFeedFixtures.activity(),
      reviewRequests: numbered(props.reviewRequests, 100).map((number) =>
        GithubFeedFixtures.pullRequest({
          number,
          title: `${title} ${number}`,
          updatedAt: BriefingFixtures.updatedAt(9, number),
        }),
      ),
      authoredPullRequests: [
        ...numbered(props.quietPullRequests, 200).map((number) =>
          BriefingFixtures.authored({ number, title, problem: false }),
        ),
        ...numbered(props.problemPullRequests, 300).map((number) =>
          BriefingFixtures.authored({ number, title, problem: true }),
        ),
      ],
      failedRuns: numbered(props.failedRuns, 400).map((number) =>
        BriefingFixtures.failedRun({ number, title }),
      ),
      assignedIssues: numbered(props.issues, 500).map((number) =>
        BriefingFixtures.issue({ number, title }),
      ),
    };
  }

  private static updatedAt(hour: number, number: number): string {
    return `2026-11-26T${String(hour).padStart(2, '0')}:${String(number % 60).padStart(2, '0')}:00Z`;
  }

  private static authored(props: {
    number: number;
    title: string;
    problem: boolean;
  }): ActivityPullRequest {
    return GithubFeedFixtures.pullRequest({
      number: props.number,
      author: 'Ada',
      title: `${props.title} ${props.number}`,
      requestedReviewers: [],
      reviewDecision: 'approved',
      checks: props.problem
        ? { state: 'failure', success: 0, failure: 2, pending: 0 }
        : { state: 'success', success: 2, failure: 0, pending: 0 },
      updatedAt: BriefingFixtures.updatedAt(10, props.number),
    });
  }

  private static failedRun(props: {
    number: number;
    title: string;
  }): Activity['failedRuns'][number] {
    return {
      provider: 'github',
      repositoryId: 'R_app',
      pullRequestId: null,
      branch: 'main',
      headSha: `main-${props.number}`,
      event: 'push',
      conclusion: 'failure',
      externalId: `WFR_${props.number}`,
      runNumber: props.number,
      workflowName: `${props.title} ${props.number}`,
      url: `https://github.com/acme/app/actions/runs/${props.number}`,
      updatedAt: BriefingFixtures.updatedAt(8, props.number),
    };
  }

  private static issue(props: {
    number: number;
    title: string;
  }): Activity['assignedIssues'][number] {
    return {
      provider: 'github',
      repositoryId: 'R_app',
      author: null,
      assignees: ['ada'],
      externalId: `I_${props.number}`,
      number: props.number,
      title: `${props.title} ${props.number}`,
      url: `https://github.com/acme/app/issues/${props.number}`,
      updatedAt: `2026-11-25T07:${String(props.number % 60).padStart(2, '0')}:00Z`,
    };
  }
}
