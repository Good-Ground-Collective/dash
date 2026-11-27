import { fileURLToPath } from 'node:url';

import {
  connectFlowCapability,
  sourceControlCapability,
  taskTrackerCapability,
} from '@dash/integrations-core';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { IntegrationsModule } from '#src/integrations/module.ts';

const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const eslint = new ESLint({ cwd: packageRoot });

class ImportBoundary {
  static async violations(props: {
    file: string;
    source: string;
  }): Promise<string[]> {
    const [result] = await eslint.lintText(props.source, {
      filePath: `${packageRoot}${props.file}`,
    });
    return (result?.messages ?? [])
      .filter(
        (message) =>
          message.ruleId === 'no-restricted-imports' ||
          message.ruleId === 'no-restricted-syntax',
      )
      .map((message) => message.message);
  }
}

const serviceFile = 'src/health/services/health-check/health-check.ts';
const providerImport =
  "import { GithubIntegration } from '@dash/integrations-github';\n\nexport const integration = new GithubIntegration({ id: 'github' });\n";

describe('IntegrationsModule', () => {
  it('registers GitHub for task tracking and source control', () => {
    const { registry } = new IntegrationsModule({ githubApp: null });
    const ids = (offers: readonly { integration: { id: string } }[]) =>
      offers.map(({ integration }) => integration.id);
    expect(ids(registry.offering(taskTrackerCapability))).toEqual(['github']);
    expect(ids(registry.offering(sourceControlCapability))).toEqual(['github']);
  });

  it('offers no connect flow until the GitHub App is configured', () => {
    const { registry } = new IntegrationsModule({ githubApp: null });

    expect(registry.offering(connectFlowCapability)).toEqual([]);
  });
});

describe('provider import boundary', () => {
  it('fails a service that imports a provider package', async () => {
    await expect(
      ImportBoundary.violations({ file: serviceFile, source: providerImport }),
    ).resolves.toEqual([
      expect.stringContaining('Depend on @dash/integrations-core'),
    ]);
  });

  it('fails a type-only provider import', async () => {
    await expect(
      ImportBoundary.violations({
        file: serviceFile,
        source:
          "import type { GithubIntegration } from '@dash/integrations-github';\n\nexport type Wired = GithubIntegration;\n",
      }),
    ).resolves.toEqual([
      expect.stringContaining('Depend on @dash/integrations-core'),
    ]);
  });

  it('fails a dynamic provider import', async () => {
    await expect(
      ImportBoundary.violations({
        file: serviceFile,
        source:
          "export const load = () => import('@dash/integrations-github');\n",
      }),
    ).resolves.toEqual([
      expect.stringContaining('Depend on @dash/integrations-core'),
    ]);
  });

  it('allows a dynamic import of the core package', async () => {
    await expect(
      ImportBoundary.violations({
        file: serviceFile,
        source:
          "export const load = () => import('@dash/integrations-core');\n",
      }),
    ).resolves.toEqual([]);
  });

  it('allows a service to import the core package', async () => {
    await expect(
      ImportBoundary.violations({
        file: serviceFile,
        source:
          "import { taskTrackerCapability } from '@dash/integrations-core';\n\nexport const capability = taskTrackerCapability;\n",
      }),
    ).resolves.toEqual([]);
  });

  it('allows the wiring module to import a provider package', async () => {
    await expect(
      ImportBoundary.violations({
        file: 'src/integrations/module.ts',
        source: providerImport,
      }),
    ).resolves.toEqual([]);
  });
});
