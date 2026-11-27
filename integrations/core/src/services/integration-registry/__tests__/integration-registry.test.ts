import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { CustomFieldReader } from '#src/contracts/custom-fields.ts';
import type { Integration } from '#src/contracts/integration.ts';
import {
  customFieldsCapability,
  taskTrackerCapability,
} from '#src/definitions/capabilities/capabilities.ts';
import type { Capability } from '#src/definitions/capabilities/capability.ts';
import { DuplicateIntegrationIdError } from '#src/errors.ts';
import {
  type Capabilities,
  CapabilitySet,
} from '#src/services/capability-set/capability-set.ts';
import { InMemoryIntegrationRegistry } from '#src/services/integration-registry/integration-registry.ts';

class FieldsReader implements CustomFieldReader {
  async listCustomFields(): Promise<[]> {
    return [];
  }
}

class FakeIntegration implements Integration {
  readonly id: string;
  readonly provider: string;
  private readonly capabilities: Capabilities;

  constructor(props: {
    id: string;
    provider?: string;
    capabilities?: Capabilities;
  }) {
    this.id = props.id;
    this.provider = props.provider ?? 'fake';
    this.capabilities = props.capabilities ?? CapabilitySet.empty();
  }

  capability<T extends object>(capability: Capability<T>): T | undefined {
    return this.capabilities.get(capability);
  }
}

describe('InMemoryIntegrationRegistry', () => {
  it('rejects two integrations with the same id', () => {
    expect(
      () =>
        new InMemoryIntegrationRegistry({
          integrations: [
            new FakeIntegration({ id: 'acme' }),
            new FakeIntegration({ id: 'acme' }),
          ],
        }),
    ).toThrow(DuplicateIntegrationIdError);
  });

  it('rejects an integration whose provider is not a provider id', () => {
    expect(
      () =>
        new InMemoryIntegrationRegistry({
          integrations: [
            new FakeIntegration({ id: 'acme', provider: 'GitHub' }),
          ],
        }),
    ).toThrow(ZodError);
  });

  it('keeps its own copy of the integrations', () => {
    const integrations = [new FakeIntegration({ id: 'acme' })];
    const registry = new InMemoryIntegrationRegistry({ integrations });
    integrations.push(new FakeIntegration({ id: 'acme' }));
    expect(registry.list()).toHaveLength(1);
  });

  it('lists only the integrations that offer a capability', () => {
    const fields = new FieldsReader();
    const plain = new FakeIntegration({ id: 'plain' });
    const extended = new FakeIntegration({
      id: 'extended',
      capabilities: CapabilitySet.empty().with(customFieldsCapability, fields),
    });
    const registry = new InMemoryIntegrationRegistry({
      integrations: [plain, extended],
    });

    expect(registry.list()).toEqual([plain, extended]);
    expect(registry.offering(customFieldsCapability)).toEqual([
      { integration: extended, implementation: fields },
    ]);
    expect(registry.offering(taskTrackerCapability)).toEqual([]);
  });
});
