import {
  activityFeedCapability,
  type IntegrationRegistry,
} from '@dash/integrations-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import type { ConnectListener } from '#src/connections/contracts/connect-listener.ts';
import type { LinkedAccountRepository } from '#src/connections/repositories/linked-accounts/linked-account-repository.ts';
import type { GithubSource } from '#src/github-feed/contracts/github-source.ts';
import { FeedRoutes } from '#src/github-feed/exposures/feed-routes/feed-routes.ts';
import type { GithubRecordReader } from '#src/github-feed/repositories/github-records/github-record-reader.ts';
import type { GithubRecordWriter } from '#src/github-feed/repositories/github-records/github-record-writer.ts';
import {
  type GithubReconcile,
  SourcedGithubReconcile,
} from '#src/github-feed/services/github-reconcile/github-reconcile.ts';
import { GithubReconcileWorkflows } from '#src/github-feed/services/github-reconcile-workflows/github-reconcile-workflows.ts';
import { OwnedGithubSource } from '#src/github-feed/services/owned-github-source/owned-github-source.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

/**
 * The GitHub feed: tables every kind of connection writes into, a reconcile that keeps
 * them fresh, and `GET /integrations/github/feed`. Owned connections are read through the
 * GitHub integration's activity feed; without the App configured there is nothing to read.
 */
export class GithubFeedModule
  implements HttpModule, WorkflowModule, ConnectListener
{
  readonly plugin: FastifyPluginAsyncZod;
  readonly reconcile: GithubReconcile;
  private readonly workflows: GithubReconcileWorkflows;

  constructor(props: {
    registry: IntegrationRegistry;
    identity: Pick<Identity, 'session'>;
    linkedAccounts: Pick<LinkedAccountRepository, 'find'>;
    reader: GithubRecordReader;
    writer: GithubRecordWriter;
  }) {
    const sources: GithubSource[] = props.registry
      .offering(activityFeedCapability)
      .filter(({ integration }) => integration.provider === 'github')
      .map(
        ({ implementation }) =>
          new OwnedGithubSource({
            feed: implementation,
            linkedAccounts: props.linkedAccounts,
          }),
      );
    this.reconcile = new SourcedGithubReconcile({
      sources,
      reader: props.reader,
      writer: props.writer,
    });
    this.workflows = new GithubReconcileWorkflows({
      reconcile: this.reconcile,
    });
    const routes = new FeedRoutes({
      reader: props.reader,
      identity: props.identity,
    });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }

  async connected(props: { provider: string; userId: string }): Promise<void> {
    if (props.provider === 'github') {
      await this.workflows.syncPerson({ userId: props.userId });
    }
  }

  async activate(): Promise<void> {
    await this.workflows.activate();
  }

  registerWorkflows(): void {
    this.workflows.registerWorkflows();
  }
}
