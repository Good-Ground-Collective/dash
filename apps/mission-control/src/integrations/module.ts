import {
  InMemoryIntegrationRegistry,
  type IntegrationRegistry,
} from '@dash/integrations-core';
import {
  type GithubAppConfig,
  GithubIntegration,
  type GithubRequest,
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
    /** Overrides how the GitHub provider calls GitHub, for tests. */
    githubRequest?: GithubRequest;
  }) {
    this.registry = new InMemoryIntegrationRegistry({
      integrations: [
        new GithubIntegration({
          id: 'github',
          app: props.githubApp ?? undefined,
          request: props.githubRequest,
        }),
      ],
    });
  }
}
