import {
  Capability,
  customFieldsCapability,
  sourceControlCapability,
  taskTrackerCapability,
} from '@dash/integrations-core';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

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

  it('offers task tracking, source control and custom fields', () => {
    expect(integration.capability(taskTrackerCapability)).toBeDefined();
    expect(integration.capability(sourceControlCapability)).toBeDefined();
    expect(integration.capability(customFieldsCapability)).toBeDefined();
  });

  it('offers nothing else', () => {
    const unknown = new Capability<object>({ name: 'unknown' });
    expect(integration.capability(unknown)).toBeUndefined();
  });

  it('reads nothing while it is a stub', async () => {
    await expect(
      integration.capability(taskTrackerCapability)?.listInitiatives(),
    ).resolves.toEqual([]);
    await expect(
      integration
        .capability(sourceControlCapability)
        ?.getCheckRollup({ pullRequestId: 'PR_1' }),
    ).resolves.toBeNull();
  });
});
