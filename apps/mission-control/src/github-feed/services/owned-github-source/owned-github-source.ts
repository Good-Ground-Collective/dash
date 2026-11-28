import type { ActivityFeed } from '@dash/integrations-core';

import type { LinkedAccountRepository } from '#src/connections/repositories/linked-accounts/linked-account-repository.ts';
import type {
  GithubSnapshot,
  GithubSource,
  GithubSyncTarget,
} from '#src/github-feed/contracts/github-source.ts';
import {
  ConnectionNotReadableError,
  ConnectorUnknownError,
  ViewerNotLinkedError,
} from '#src/github-feed/errors.ts';
import { recentActivityRetentionMs } from '#src/github-feed/definitions/feed-retention/feed-retention.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';

/**
 * Reads `owned` connections through the App's installation, for the person who connected
 * them: their linked GitHub login decides whose reviews, pull requests and issues count.
 */
export class OwnedGithubSource implements GithubSource {
  readonly kind = 'owned';
  private readonly feed: ActivityFeed;
  private readonly linkedAccounts: Pick<LinkedAccountRepository, 'find'>;

  constructor(props: {
    feed: ActivityFeed;
    linkedAccounts: Pick<LinkedAccountRepository, 'find'>;
  }) {
    this.feed = props.feed;
    this.linkedAccounts = props.linkedAccounts;
  }

  async read(target: GithubSyncTarget): Promise<GithubSnapshot> {
    if (target.installationId === null) {
      throw new ConnectionNotReadableError({
        connectionId: target.connectionId,
      });
    }
    if (target.connectedBy === null) {
      throw new ConnectorUnknownError({ connectionId: target.connectionId });
    }
    const linked = await this.linkedAccounts.find({
      userId: target.connectedBy,
      provider: 'github',
    });
    if (linked === null) {
      throw new ViewerNotLinkedError();
    }

    const viewerLogin = linked.account.login;
    const activity = await this.feed.read({
      installationId: target.installationId,
      account: target.account,
      viewerLogin,
      repositories: [...target.repositories],
      since: new Date(Date.now() - recentActivityRetentionMs).toISOString(),
    });
    return {
      viewerLogin,
      records: ActivityRecords.from({ activity, viewerLogin }),
      releaseReads: ActivityRecords.releaseReads(activity),
      truncated: activity.truncated,
    };
  }
}
