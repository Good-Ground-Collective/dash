import {
  type Capability,
  CapabilitySet,
  customFieldsCapability,
  type Integration,
  sourceControlCapability,
  taskTrackerCapability,
} from '@dash/integrations-core';

import { GithubProjectFields } from '#src/services/github-project-fields/github-project-fields.ts';
import { GithubSourceControl } from '#src/services/github-source-control/github-source-control.ts';
import { GithubTaskTracker } from '#src/services/github-task-tracker/github-task-tracker.ts';

/** One GitHub connection. Offers task tracking, source control and Project custom fields. */
export class GithubIntegration implements Integration {
  readonly id: string;
  readonly provider = 'github';
  private readonly capabilities: CapabilitySet;

  constructor(props: { id: string }) {
    this.id = props.id;
    this.capabilities = new CapabilitySet()
      .with(taskTrackerCapability, new GithubTaskTracker())
      .with(sourceControlCapability, new GithubSourceControl())
      .with(customFieldsCapability, new GithubProjectFields());
  }

  capability<T extends object>(capability: Capability<T>): T | undefined {
    return this.capabilities.get(capability);
  }
}
