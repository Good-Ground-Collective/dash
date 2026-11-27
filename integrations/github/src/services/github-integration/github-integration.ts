import {
  type Capabilities,
  type Capability,
  CapabilitySet,
  customFieldsCapability,
  type Integration,
  sourceControlCapability,
  taskTrackerCapability,
} from '@dash/integrations-core';
import { z } from 'zod';

import { GithubProjectFields } from '#src/services/github-project-fields/github-project-fields.ts';
import { GithubSourceControl } from '#src/services/github-source-control/github-source-control.ts';
import { GithubTaskTracker } from '#src/services/github-task-tracker/github-task-tracker.ts';

export const githubIntegrationPropsSchema = z.object({
  id: z.string().min(1),
});

/** One GitHub connection. Offers task tracking, source control and Project custom fields. */
export class GithubIntegration implements Integration {
  readonly id: string;
  readonly provider = 'github';
  private readonly capabilities: Capabilities;

  constructor(props: z.input<typeof githubIntegrationPropsSchema>) {
    this.id = githubIntegrationPropsSchema.parse(props).id;
    this.capabilities = CapabilitySet.empty()
      .with(taskTrackerCapability, new GithubTaskTracker())
      .with(sourceControlCapability, new GithubSourceControl())
      .with(customFieldsCapability, new GithubProjectFields());
  }

  capability<T extends object>(capability: Capability<T>): T | undefined {
    return this.capabilities.get(capability);
  }
}
