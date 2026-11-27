import {
  activityFeedCapability,
  Capability,
  connectFlowCapability,
  customFieldsCapability,
  sourceControlCapability,
  taskTrackerCapability,
} from '@dash/integrations-core';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { appConfig } from '#src/__tests__/support/fake-github.ts';
import { GithubIntegration } from '#src/services/github-integration/github-integration.ts';

describe('GithubIntegration', () => {
  const integration = new GithubIntegration({ id: 'github-acme' });

  it('identifies as the github provider under its own id', () => {
    expect(integration).toMatchObject({
      id: 'github-acme',
      provider: 'github',
    });
  });

  it('rejects an empty id', () => {
    expect(() => new GithubIntegration({ id: '' })).toThrow(ZodError);
  });

  it('offers source control and custom fields', () => {
    expect(integration.capability(sourceControlCapability)).toBeDefined();
    expect(integration.capability(customFieldsCapability)).toBeDefined();
  });

  it('offers the connect flow, activity feed and task tracking only when the App is configured', () => {
    const withApp = new GithubIntegration({ id: 'github', app: appConfig });

    expect(integration.capability(connectFlowCapability)).toBeUndefined();
    expect(integration.capability(activityFeedCapability)).toBeUndefined();
    expect(integration.capability(taskTrackerCapability)).toBeUndefined();
    expect(withApp.capability(connectFlowCapability)).toBeDefined();
    expect(withApp.capability(activityFeedCapability)).toBeDefined();
    expect(withApp.capability(taskTrackerCapability)).toBeDefined();
  });

  it('offers nothing else', () => {
    const unknown = new Capability<object>({ name: 'unknown' });
    expect(integration.capability(unknown)).toBeUndefined();
  });

  it('reads nothing while source control is a stub', async () => {
    await expect(
      integration
        .capability(sourceControlCapability)
        ?.getCheckRollup({ pullRequestId: 'PR_1' }),
    ).resolves.toBeNull();
  });
});
