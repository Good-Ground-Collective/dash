import {
  InMemoryIntegrationRegistry,
  type IntegrationRegistry,
} from '@dash/integrations-core';
import {
  type GithubAppConfig,
  GithubIntegration,
} from '@dash/integrations-github';

/**
 * The one place Mission Control names provider packages. Other modules take the registry
 * and reach providers only through capabilities.
 */
export class IntegrationsModule {
  readonly registry: IntegrationRegistry;

  constructor(props: {
    /** The registered GitHub App. Without it, GitHub offers no connect flow. */
    githubApp: GithubAppConfig | null;
  }) {
    this.registry = new InMemoryIntegrationRegistry({
      integrations: [
        new GithubIntegration({
          id: 'github',
          app: props.githubApp ?? undefined,
        }),
      ],
    });
  }
}
