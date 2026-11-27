import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ServiceAccountHarness } from '#src/auth/__tests__/support/service-account-harness.ts';

const sessionAppearanceSchema = z
  .object({
    user: z.object({
      theme: z.string(),
      colorMode: z.string().nullish(),
    }),
  })
  .transform(({ user }) => ({
    theme: user.theme,
    colorMode: user.colorMode ?? null,
  }));

describe('AppearanceEndpoints', () => {
  it('returns Characters with no colour mode before the person picks one', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();

    const response = await harness.get({ path: '/get-session', cookie });

    expect(sessionAppearanceSchema.parse(await response.json())).toEqual({
      theme: 'characters',
      colorMode: null,
    });
  });

  it('saves the theme and mode, and the session lookup returns them', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();

    const saved = await harness.post({
      path: '/appearance/update',
      cookie,
      body: { theme: 'characters', mode: 'dark' },
    });
    const session = await harness.get({ path: '/get-session', cookie });

    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ theme: 'characters', mode: 'dark' });
    expect(sessionAppearanceSchema.parse(await session.json())).toEqual({
      theme: 'characters',
      colorMode: 'dark',
    });
  });

  it('refuses a theme or mode it does not know', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();

    const response = await harness.post({
      path: '/appearance/update',
      cookie,
      body: { theme: 'neon', mode: 'sepia' },
    });

    expect(response.status).toBe(400);
  });

  it('refuses a request without a session', async () => {
    const harness = new ServiceAccountHarness();

    const response = await harness.post({
      path: '/appearance/update',
      cookie: '',
      body: { theme: 'characters', mode: 'dark' },
    });

    expect(response.status).toBe(401);
  });

  it('keeps the fields out of Better Auth’s own profile update', async () => {
    const harness = new ServiceAccountHarness();
    const cookie = await harness.signIn();

    const response = await harness.post({
      path: '/update-user',
      cookie,
      body: { colorMode: 'dark' },
    });
    const session = await harness.get({ path: '/get-session', cookie });

    expect(response.ok).toBe(false);
    expect(
      sessionAppearanceSchema.parse(await session.json()).colorMode,
    ).toBeNull();
  });
});

describe('AppearanceEndpoints for service principals', () => {
  it('refuses a service principal that somehow holds a session', async () => {
    const harness = new ServiceAccountHarness();
    const owner = await harness.signIn();
    const created = await harness.createAccount({
      cookie: owner,
      account: {
        kind: 'agent',
        name: 'Rook',
        agentName: 'rook',
        description: 'Reviews pull requests',
        scopes: ['heartbeat:write'],
      },
    });
    const cookie = await harness.forgeSession({
      userId: created.serviceAccount.id,
    });

    const response = await harness.post({
      path: '/appearance/update',
      cookie,
      body: { theme: 'characters', mode: 'dark' },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'SERVICE_PRINCIPAL_FORBIDDEN',
    });
  });
});
