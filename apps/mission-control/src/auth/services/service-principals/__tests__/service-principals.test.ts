import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type {
  PrincipalKind,
  ServicePrincipal,
} from '#src/auth/contracts/principal.ts';
import { ServicePrincipalOwnerError } from '#src/auth/errors.ts';
import type {
  ServicePrincipalRecord,
  ServicePrincipalRepository,
} from '#src/auth/repositories/service-principals/service-principal-repository.ts';
import { StoredServicePrincipals } from '#src/auth/services/service-principals/service-principals.ts';

class InMemoryServicePrincipalRepository implements ServicePrincipalRepository {
  readonly kinds = new Map<string, PrincipalKind>();
  readonly created: ServicePrincipal[] = [];

  async create(record: ServicePrincipalRecord): Promise<ServicePrincipal> {
    const principal = { ...record, createdAt: new Date().toISOString() };
    this.kinds.set(record.id, 'service');
    this.created.push(principal);
    return principal;
  }

  async findKind(props: { id: string }): Promise<PrincipalKind | null> {
    return this.kinds.get(props.id) ?? null;
  }
}

const ownerUserId = '0193b4c2-7d3e-7000-8000-000000000001';

describe('StoredServicePrincipals', () => {
  it('gives a service principal a synthetic, non-routable email from its id', async () => {
    const repository = new InMemoryServicePrincipalRepository();
    repository.kinds.set(ownerUserId, 'user');
    const servicePrincipals = new StoredServicePrincipals({ repository });

    const principal = await servicePrincipals.create({
      name: 'Studio bench',
      ownerUserId,
      benchId: 'studio',
      description: 'The desk machine',
    });

    expect(principal.email).toBe(`svc-${principal.id}@service.invalid`);
    expect(principal).toMatchObject({
      ownerUserId,
      benchId: 'studio',
      agentName: null,
    });
  });

  it.each([
    ['a service principal', 'service' as const],
    ['nobody', undefined],
  ])('refuses %s as an owner', async (_label, kind) => {
    const repository = new InMemoryServicePrincipalRepository();
    if (kind !== undefined) {
      repository.kinds.set(ownerUserId, kind);
    }
    const servicePrincipals = new StoredServicePrincipals({ repository });

    await expect(
      servicePrincipals.create({
        name: 'Runner',
        ownerUserId,
        agentName: 'ci',
        description: 'CI runner',
      }),
    ).rejects.toBeInstanceOf(ServicePrincipalOwnerError);
    expect(repository.created).toEqual([]);
  });

  it('requires a description', async () => {
    const repository = new InMemoryServicePrincipalRepository();
    repository.kinds.set(ownerUserId, 'user');
    const servicePrincipals = new StoredServicePrincipals({ repository });

    await expect(
      servicePrincipals.create({
        name: 'Bench',
        ownerUserId,
        description: ' ',
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
