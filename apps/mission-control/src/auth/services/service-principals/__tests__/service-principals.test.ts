import { describe, expect, it } from 'vitest';

import { InMemoryServicePrincipalRepository } from '#src/auth/__tests__/support/in-memory-service-principals.ts';
import { characterHues } from '#src/auth/definitions/character-hues/character-hues.ts';
import { ServicePrincipalOwnerError } from '#src/auth/errors.ts';
import { StoredServicePrincipals } from '#src/auth/services/service-principals/service-principals.ts';

const ownerUserId = '0193b4c2-7d3e-7000-8000-000000000001';

describe('StoredServicePrincipals', () => {
  it('gives a service principal a synthetic, non-routable email from its id', async () => {
    const repository = new InMemoryServicePrincipalRepository();
    repository.addPrincipal({ id: ownerUserId, kind: 'user' });
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
      repository.addPrincipal({ id: ownerUserId, kind });
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
    expect(repository.principals.size).toBe(0);
  });

  it('requires a description', async () => {
    const repository = new InMemoryServicePrincipalRepository();
    repository.addPrincipal({ id: ownerUserId, kind: 'user' });
    const servicePrincipals = new StoredServicePrincipals({ repository });

    await expect(
      servicePrincipals.create({
        name: 'Bench',
        ownerUserId,
        benchId: 'studio-mac',
        description: ' ',
      }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['description'] })],
    });
  });
});

describe('StoredServicePrincipals hues', () => {
  it('keeps the hue the owner picked', async () => {
    const repository = new InMemoryServicePrincipalRepository();
    repository.addPrincipal({ id: ownerUserId, kind: 'user' });
    const servicePrincipals = new StoredServicePrincipals({ repository });

    const principal = await servicePrincipals.create({
      name: 'Studio bench',
      ownerUserId,
      benchId: 'studio',
      description: 'The desk machine',
      hue: 'teal',
    });

    expect(principal.hue).toBe('teal');
  });

  it('picks the same coloured hue from the bench id or agent name when none is given', async () => {
    const repository = new InMemoryServicePrincipalRepository();
    repository.addPrincipal({ id: ownerUserId, kind: 'user' });
    const servicePrincipals = new StoredServicePrincipals({ repository });

    const principal = await servicePrincipals.create({
      name: 'Reviewer',
      ownerUserId,
      agentName: 'rook',
      description: 'Reviews pull requests',
    });

    expect(principal.hue).toBe(characterHues.forIdentifier('rook'));
  });
});
