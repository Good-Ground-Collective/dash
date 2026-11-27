import {
  type Capabilities,
  type Capability,
  CapabilitySet,
  connectFlowCapability,
  customFieldsCapability,
  type Integration,
  sourceControlCapability,
  taskTrackerCapability,
} from '@dash/integrations-core';
import { z } from 'zod';

import type { GithubAppConfig } from '#src/contracts/github-app-config.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';
import { GithubConnectFlow } from '#src/services/github-connect-flow/github-connect-flow.ts';
import { GithubProjectFields } from '#src/services/github-project-fields/github-project-fields.ts';
import { GithubSourceControl } from '#src/services/github-source-control/github-source-control.ts';
import { GithubTaskTracker } from '#src/services/github-task-tracker/github-task-tracker.ts';

export const githubIntegrationPropsSchema = z.object({
  id: z.string().min(1),
});

/**
 * One GitHub connection. Offers task tracking, source control and Project custom fields, and
 * the App's connect flow when the App is configured.
 */
export class GithubIntegration implements Integration {
  readonly id: string;
  readonly provider = 'github';
  private readonly capabilities: Capabilities;

  constructor(
    props: z.input<typeof githubIntegrationPropsSchema> & {
      /** The registered App. Without it, the connect flow isn't offered. */
      app?: GithubAppConfig | undefined;
      /** Defaults to `@octokit/request`. Tests pass one with a stubbed `fetch`. */
      request?: GithubRequest | undefined;
    },
  ) {
    this.id = githubIntegrationPropsSchema.parse(props).id;
    const capabilities = CapabilitySet.empty()
      .with(taskTrackerCapability, new GithubTaskTracker())
      .with(sourceControlCapability, new GithubSourceControl())
      .with(customFieldsCapability, new GithubProjectFields());
    this.capabilities =
      props.app === undefined
        ? capabilities
        : capabilities.with(
            connectFlowCapability,
            new GithubConnectFlow({
              config: props.app,
              request: props.request,
            }),
          );
  }

  capability<T extends object>(capability: Capability<T>): T | undefined {
    return this.capabilities.get(capability);
  }
}
