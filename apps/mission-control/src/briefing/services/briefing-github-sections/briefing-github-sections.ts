import type { BriefingDraft } from '#src/briefing/contracts/briefing-draft.ts';
import type {
  BriefingIssueDraft,
  BriefingPullRequestDraft,
  BriefingRunDraft,
} from '#src/briefing/contracts/briefing-snapshot.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import { BriefingText } from '#src/briefing/services/briefing-text/briefing-text.ts';
import type {
  GithubFeed,
  GithubFeedIssue,
  GithubFeedPullRequest,
  GithubFeedRun,
} from '#src/github-feed/contracts/github-feed.ts';

type GithubSections = Pick<
  BriefingDraft,
  'reviewRequests' | 'myPullRequests' | 'failedRuns' | 'assignedIssues'
>;

/** The feed `GET /integrations/github/feed` returns, cut to what a snapshot keeps. The feed's order, newest first, is kept. Commit ids and connection ids are left out. */
export class BriefingGithubSections {
  static sections(feed: GithubFeed): GithubSections {
    const limit = briefingLimits.githubItems;
    return {
      reviewRequests: feed.reviewRequests
        .slice(0, limit)
        .map((pullRequest) => BriefingGithubSections.pullRequest(pullRequest)),
      myPullRequests: feed.myPullRequests
        .slice(0, limit)
        .map((pullRequest) => BriefingGithubSections.pullRequest(pullRequest)),
      failedRuns: feed.failedRuns
        .slice(0, limit)
        .map((run) => BriefingGithubSections.run(run)),
      assignedIssues: feed.assignedIssues
        .slice(0, limit)
        .map((issue) => BriefingGithubSections.issue(issue)),
    };
  }

  static counts(feed: GithubFeed) {
    return {
      reviewRequests: feed.reviewRequests.length,
      myPullRequests: feed.myPullRequests.length,
      failedRuns: feed.failedRuns.length,
      assignedIssues: feed.assignedIssues.length,
    };
  }

  private static pullRequest(
    pullRequest: GithubFeedPullRequest,
  ): BriefingPullRequestDraft {
    return {
      url: pullRequest.url,
      repository: BriefingText.cap(
        pullRequest.repository.fullName,
        briefingLimits.nameLength,
      ),
      number: pullRequest.number,
      title: BriefingText.cap(pullRequest.title, briefingLimits.titleLength),
      author: BriefingText.capped(
        pullRequest.author,
        briefingLimits.nameLength,
      ),
      draft: pullRequest.draft,
      reviewDecision: pullRequest.reviewDecision,
      mergeable: pullRequest.mergeable,
      checks:
        pullRequest.checks === null
          ? null
          : {
              state: pullRequest.checks.state,
              failure: pullRequest.checks.failure,
            },
      updatedAt: pullRequest.updatedAt,
    };
  }

  private static run(run: GithubFeedRun): BriefingRunDraft {
    return {
      url: run.url,
      repository: BriefingText.cap(
        run.repository.fullName,
        briefingLimits.nameLength,
      ),
      workflowName: BriefingText.cap(
        run.workflowName,
        briefingLimits.nameLength,
      ),
      runNumber: run.runNumber,
      branch: BriefingText.cap(run.branch, briefingLimits.nameLength),
      event: BriefingText.cap(run.event, briefingLimits.nameLength),
      conclusion: run.conclusion,
      updatedAt: run.updatedAt,
    };
  }

  private static issue(issue: GithubFeedIssue): BriefingIssueDraft {
    return {
      url: issue.url,
      repository: BriefingText.cap(
        issue.repository.fullName,
        briefingLimits.nameLength,
      ),
      number: issue.number,
      title: BriefingText.cap(issue.title, briefingLimits.titleLength),
      author: BriefingText.capped(issue.author, briefingLimits.nameLength),
      updatedAt: issue.updatedAt,
    };
  }
}
