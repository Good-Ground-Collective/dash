import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { BrokenApiKeys } from '#src/auth/__tests__/support/broken-api-keys.ts';
import { InMemoryServicePrincipalRepository } from '#src/auth/__tests__/support/in-memory-service-principals.ts';
import { ServiceAccountHarness } from '#src/auth/__tests__/support/service-account-harness.ts';
import { UnremovableServicePrincipals } from '#src/auth/__tests__/support/unremovable-service-principals.ts';
import {
  issuedApiKeySchema,
  type NewServiceAccount,
  serviceAccountListSchema,
} from '#src/auth/contracts/service-account.ts';
import {
  ApiKeyNotIssuedError,
  ServiceAccountNotCreatedError,
} from '#src/auth/errors.ts';
import { OwnedServiceAccounts } from '#src/auth/services/service-accounts/service-accounts.ts';
import { StoredServicePrincipals } from '#src/auth/services/service-principals/service-principals.ts';

const studioBench: NewServiceAccount = {
  kind: 'bench',
  name: 'Studio Mac',
  benchId: 'studio-mac',
  description: 'The desk machine',
  scopes: ['heartbeat:write', 'telemetry:write'],
};

const ciAgent: NewServiceAccount = {
  kind: 'agent',
  name: 'CI reviewer',
  agentName: 'ci-reviewer',
  description: 'Runs in GitHub Actions',
  scopes: ['heartbeat:write'],
};

const dayMilliseconds = 24 * 60 * 60 * 1000;

describe('OwnedServiceAccounts creating', () => {
  it('issues a bench key once, hashed at rest, with a dev prefix and no expiry', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();

    const created = await harness.createAccount({
      cookie,
      account: studioBench,
    });

    expect(created.apiKey.secret).toMatch(/^dash_dev_[A-Za-z]{64}$/u);
    expect(created.apiKey.key).toMatchObject({
      start: created.apiKey.secret.slice(0, 15),
      scopes: ['heartbeat:write', 'telemetry:write'],
      expiresAt: null,
      lastUsedAt: null,
    });
    expect(created.serviceAccount).toMatchObject({
      kind: 'bench',
      benchId: 'studio-mac',
      agentName: null,
    });

    const stored = harness.tables.apikey[0];
    expect(stored?.key).toBe(
      createHash('sha256').update(created.apiKey.secret).digest('base64url'),
    );
    expect(JSON.stringify(harness.tables.apikey)).not.toContain(
      created.apiKey.secret,
    );
  });

  it('gives agent keys 90 days', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();

    const created = await harness.createAccount({ cookie, account: ciAgent });

    const expiresAt = new Date(created.apiKey.key.expiresAt ?? 0).getTime();
    expect(expiresAt - Date.now()).toBeGreaterThan(89 * dayMilliseconds);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(90 * dayMilliseconds);
  });
});

describe('OwnedServiceAccounts creating rules', () => {
  it('keeps one account per bench', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();
    await harness.createAccount({ cookie, account: studioBench });

    const response = await harness.post({
      path: '/service-accounts/create',
      cookie,
      body: studioBench,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'SERVICE_ACCOUNT_TAKEN',
    });
  });

  it('needs a sign-in from the last 15 minutes', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();
    harness.ageSessions({ minutes: 16 });

    const response = await harness.post({
      path: '/service-accounts/create',
      cookie,
      body: studioBench,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' });
    expect(harness.repository.principals.size).toBe(0);
  });

  it('refuses a request without a session', async () => {
    const harness = new ServiceAccountHarness();

    const response = await harness.post({
      path: '/service-accounts/create',
      cookie: '',
      body: studioBench,
    });

    expect(response.status).toBe(401);
  });

  it('closes the api-key plugin’s own endpoints, so nobody mints a key for themselves', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();

    const response = await harness.post({
      path: '/api-key/create',
      cookie,
      body: {},
    });

    expect(response.status).toBe(404);
    expect(harness.tables.apikey).toEqual([]);
  });
});

describe('OwnedServiceAccounts listing', () => {
  it('lists only the signed-in person’s accounts, with their keys, after any sign-in age', async () => {
    const harness = new ServiceAccountHarness();
    const ada = await harness.signIn();
    const grace = await harness.signIn({ email: 'grace@example.com' });
    const created = await harness.createAccount({
      cookie: ada,
      account: studioBench,
    });
    await harness.createAccount({ cookie: grace, account: ciAgent });
    harness.ageSessions({ minutes: 60 });

    const response = await harness.get({
      path: '/service-accounts/list',
      cookie: ada,
    });

    const { serviceAccounts } = serviceAccountListSchema.parse(
      await response.json(),
    );
    expect(serviceAccounts).toEqual([
      { ...created.serviceAccount, keys: [created.apiKey.key] },
    ]);
  });
});

describe('OwnedServiceAccounts revoking', () => {
  it('issues another key and revokes one key without touching the other', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();
    const created = await harness.createAccount({
      cookie,
      account: studioBench,
    });
    const issued = await harness.post({
      path: '/service-accounts/keys/create',
      cookie,
      body: { serviceAccountId: created.serviceAccount.id },
    });
    const second = issuedApiKeySchema.parse(await issued.json());

    const revoked = await harness.post({
      path: '/service-accounts/keys/revoke',
      cookie,
      body: { keyId: created.apiKey.key.id },
    });

    expect(revoked.status).toBe(200);
    expect(second.key.scopes).toEqual(studioBench.scopes);
    expect(harness.tables.apikey.map((row) => row.id)).toEqual([second.key.id]);
  });
});

describe('OwnedServiceAccounts replacing the only key', () => {
  it('gives the new key exactly the account’s scopes, whatever the request asks for', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();
    const created = await harness.createAccount({ cookie, account: ciAgent });
    await harness.post({
      path: '/service-accounts/keys/revoke',
      cookie,
      body: { keyId: created.apiKey.key.id },
    });

    const issued = await harness.post({
      path: '/service-accounts/keys/create',
      cookie,
      body: {
        serviceAccountId: created.serviceAccount.id,
        scopes: ['heartbeat:write', 'telemetry:write'],
      },
    });
    const replacement = issuedApiKeySchema.parse(await issued.json());

    expect(replacement.key.scopes).toEqual(['heartbeat:write']);
    expect(harness.tables.apikey.map((row) => row.id)).toEqual([
      replacement.key.id,
    ]);
  });
});

describe('OwnedServiceAccounts revoking accounts', () => {
  it('removes an account and every key it holds', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();
    const created = await harness.createAccount({
      cookie,
      account: studioBench,
    });

    const response = await harness.post({
      path: '/service-accounts/revoke',
      cookie,
      body: { serviceAccountId: created.serviceAccount.id },
    });

    expect(response.status).toBe(200);
    expect(harness.tables.apikey).toEqual([]);
    expect(harness.repository.principals.size).toBe(0);
    expect(
      harness.tables.user.some((row) => row.id === created.serviceAccount.id),
    ).toBe(false);
  });

  it('answers 404 for someone else’s account or key', async () => {
    const harness = new ServiceAccountHarness();
    const ada = await harness.signIn();
    const grace = await harness.signIn({ email: 'grace@example.com' });
    const created = await harness.createAccount({
      cookie: ada,
      account: studioBench,
    });

    const account = await harness.post({
      path: '/service-accounts/revoke',
      cookie: grace,
      body: { serviceAccountId: created.serviceAccount.id },
    });
    const key = await harness.post({
      path: '/service-accounts/keys/revoke',
      cookie: grace,
      body: { keyId: created.apiKey.key.id },
    });

    expect(account.status).toBe(404);
    expect(key.status).toBe(404);
    expect(harness.tables.apikey).toHaveLength(1);
  });

  it('needs a fresh sign-in to revoke', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();
    const created = await harness.createAccount({
      cookie,
      account: studioBench,
    });
    harness.ageSessions({ minutes: 16 });

    const response = await harness.post({
      path: '/service-accounts/keys/revoke',
      cookie,
      body: { keyId: created.apiKey.key.id },
    });

    expect(response.status).toBe(403);
    expect(harness.tables.apikey).toHaveLength(1);
  });
});

describe('OwnedServiceAccounts creating when the key fails', () => {
  it('removes the account again, so the bench id stays free', async () => {
    const repository = new InMemoryServicePrincipalRepository();
    const accounts = new OwnedServiceAccounts({
      servicePrincipals: new StoredServicePrincipals({ repository }),
      apiKeys: new BrokenApiKeys(),
    });
    const owner = { ownerUserId: '0b6a3c3e-4f7e-4c1c-9a57-2a7f3d1f0c11' };
    repository.addPrincipal({ id: owner.ownerUserId, kind: 'user' });

    const created = accounts.create({
      context: await new ServiceAccountHarness().auth.identity.auth.$context,
      ...owner,
      input: studioBench,
    });

    await expect(created).rejects.toBeInstanceOf(ApiKeyNotIssuedError);
    await expect(repository.listOwnedBy(owner)).resolves.toEqual([]);
  });
});

describe('OwnedServiceAccounts creating when the key and the clean-up fail', () => {
  it('still reports why the key failed', async () => {
    const repository = new UnremovableServicePrincipals();
    const accounts = new OwnedServiceAccounts({
      servicePrincipals: new StoredServicePrincipals({ repository }),
      apiKeys: new BrokenApiKeys(),
    });
    const owner = { ownerUserId: '0b6a3c3e-4f7e-4c1c-9a57-2a7f3d1f0c11' };
    repository.addPrincipal({ id: owner.ownerUserId, kind: 'user' });

    const failure: unknown = await accounts
      .create({
        context: await new ServiceAccountHarness().auth.identity.auth.$context,
        ...owner,
        input: studioBench,
      })
      .catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(ServiceAccountNotCreatedError);
    expect(failure).toMatchObject({
      cause: expect.any(ApiKeyNotIssuedError),
      cleanup: expect.objectContaining({ message: 'database unavailable' }),
    });
  });
});
