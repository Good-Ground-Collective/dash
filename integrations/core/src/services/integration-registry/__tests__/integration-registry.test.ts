import { describe, expect, it } from 'vitest';

import type { CustomFieldReader } from '#src/contracts/custom-fields.ts';
import type { Integration } from '#src/contracts/integration.ts';
import {
  customFieldsCapability,
  taskTrackerCapability,
} from '#src/definitions/capabilities/capabilities.ts';
import type { Capability } from '#src/definitions/capabilities/capability.ts';
import { DuplicateIntegrationIdError } from '#src/errors.ts';
import { CapabilitySet } from '#src/services/capability-set/capability-set.ts';
import { InMemoryIntegrationRegistry } from '#src/services/integration-registry/integration-registry.ts';

class FieldsReader implements CustomFieldReader {
  async listCustomFields(): Promise<[]> {
    return [];
  }
}

class FakeIntegration implements Integration {
  readonly id: string;
  readonly provider = 'fake';
  private readonly capabilities: CapabilitySet;

  constructor(props: { id: string; capabilities?: CapabilitySet }) {
    this.id = props.id;
    this.capabilities = props.capabilities ?? new CapabilitySet();
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

  it('lists only the integrations that offer a capability', () => {
    const fields = new FieldsReader();
    const plain = new FakeIntegration({ id: 'plain' });
    const extended = new FakeIntegration({
      id: 'extended',
      capabilities: new CapabilitySet().with(customFieldsCapability, fields),
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
