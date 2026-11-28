import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { WorkflowRuntimeConfig } from '#src/platform/services/workflows/workflow-runtime.config.ts';

describe('WorkflowRuntimeConfig', () => {
  it('does not force the latest version unless asked to', () => {
    expect(new WorkflowRuntimeConfig({}).forceLatestVersion).toBe(false);
  });

  it('forces the latest version for a rollback deploy', () => {
    expect(
      new WorkflowRuntimeConfig({ DASH_CLAIM_LATEST_VERSION: 'force' })
        .forceLatestVersion,
    ).toBe(true);
  });

  it('rejects any other value rather than silently not forcing', () => {
    expect(
      () => new WorkflowRuntimeConfig({ DASH_CLAIM_LATEST_VERSION: 'true' }),
    ).toThrow(ZodError);
  });
});
