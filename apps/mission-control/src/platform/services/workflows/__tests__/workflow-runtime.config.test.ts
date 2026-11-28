import { describe, expect, it } from 'vitest';

import { ConfigError } from '#src/platform/errors.ts';
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

  it.each(['true', 'Force'])(
    'rejects %s rather than silently not forcing, naming the variable',
    (value) => {
      const build = () =>
        new WorkflowRuntimeConfig({ DASH_CLAIM_LATEST_VERSION: value });

      expect(build).toThrow(ConfigError);
      expect(build).toThrow(/DASH_CLAIM_LATEST_VERSION/);
    },
  );
});
