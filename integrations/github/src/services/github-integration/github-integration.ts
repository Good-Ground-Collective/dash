import {
  activityFeedCapability,
  type Capabilities,
  type Capability,
  CapabilitySet,
  connectFlowCapability,
  customFieldsCapability,
  type Integration,
  sourceControlCapability,
  taskTrackerCapability,
} from '@dash/integrations-core';
import { request as octokitRequest } from '@octokit/request';
import { z } from 'zod';

import type { GithubAppConfig } from '#src/contracts/github-app-config.ts';
import { GithubActivityFeed } from '#src/services/github-activity-feed/github-activity-feed.ts';
import { GithubConnectFlow } from '#src/services/github-connect-flow/github-connect-flow.ts';
import { GithubProjectFields } from '#src/services/github-project-fields/github-project-fields.ts';
import { GithubSourceControl } from '#src/services/github-source-control/github-source-control.ts';
import { GithubTaskTracker } from '#src/services/github-task-tracker/github-task-tracker.ts';

export const githubIntegrationPropsSchema = z.object({
  id: z.string().min(1),
});

/**
 * One GitHub connection. Offers source control and Project custom fields, and the App's
 * connect flow, activity feed and task tracking when the App is configured.
 */
export class GithubIntegration implements Integration {
  readonly id: string;
  readonly provider = 'github';
  private readonly capabilities: Capabilities;

  constructor(
    props: z.input<typeof githubIntegrationPropsSchema> & {
      /** The registered App. Without it, the connect flow isn't offered. */
      app?: GithubAppConfig | undefined;
    },
  ) {
    this.id = githubIntegrationPropsSchema.parse(props).id;
    const capabilities = CapabilitySet.empty()
      .with(sourceControlCapability, new GithubSourceControl())
      .with(customFieldsCapability, new GithubProjectFields());
    if (props.app === undefined) {
      this.capabilities = capabilities;
      return;
    }
    const installation = {
      appId: props.app.appId,
      privateKey: props.app.privateKey,
      request: octokitRequest.defaults({
        headers: { 'user-agent': 'dash-mission-control' },
      }),
    };
    this.capabilities = capabilities
      .with(connectFlowCapability, new GithubConnectFlow({ config: props.app }))
      .with(activityFeedCapability, new GithubActivityFeed(installation))
      .with(taskTrackerCapability, new GithubTaskTracker(installation));
  }

  capability<T extends object>(capability: Capability<T>): T | undefined {
    return this.capabilities.get(capability);
  }
}
