import { providerIdSchema } from '#src/contracts/external-record.ts';
import type { Integration } from '#src/contracts/integration.ts';
import type { Capability } from '#src/definitions/capabilities/capability.ts';
import { DuplicateIntegrationIdError } from '#src/errors.ts';

export interface CapabilityOffer<T extends object> {
  integration: Integration;
  implementation: T;
}

/** The integrations Mission Control registered at startup. */
export interface IntegrationRegistry {
  list(): readonly Integration[];
  /** Every registered integration that offers `capability`, with its implementation. */
  offering<T extends object>(
    capability: Capability<T>,
  ): readonly CapabilityOffer<T>[];
}

export class InMemoryIntegrationRegistry implements IntegrationRegistry {
  private readonly integrations: readonly Integration[];

  constructor(props: { integrations: readonly Integration[] }) {
    const seen = new Set<string>();
    for (const integration of props.integrations) {
      if (seen.has(integration.id)) {
        throw new DuplicateIntegrationIdError({
          integrationId: integration.id,
        });
      }
      providerIdSchema.parse(integration.provider);
      seen.add(integration.id);
    }
    this.integrations = Object.freeze([...props.integrations]);
  }

  list(): readonly Integration[] {
    return this.integrations;
  }

  offering<T extends object>(
    capability: Capability<T>,
  ): readonly CapabilityOffer<T>[] {
    return this.integrations.flatMap((integration) => {
      const implementation = integration.capability(capability);
      return implementation === undefined
        ? []
        : [{ integration, implementation }];
    });
  }
}
