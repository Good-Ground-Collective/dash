import {
  InMemoryIntegrationRegistry,
  type IntegrationRegistry,
} from '@dash/integrations-core';
import { GithubIntegration } from '@dash/integrations-github';

/**
 * The one place Mission Control names provider packages. Other modules take the registry
 * and reach providers only through capabilities.
 */
export class IntegrationsModule {
  readonly registry: IntegrationRegistry;

  constructor() {
    this.registry = new InMemoryIntegrationRegistry({
      integrations: [new GithubIntegration({ id: 'github' })],
    });
  }
}
