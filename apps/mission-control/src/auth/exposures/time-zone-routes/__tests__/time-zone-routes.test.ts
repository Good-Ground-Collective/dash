import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  harnessWebOrigin,
  ServiceAccountHarness,
} from '#src/auth/__tests__/support/service-account-harness.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

const sessionTimeZoneSchema = z
  .object({ user: z.object({ timeZone: z.string() }) })
  .transform(({ user }) => user.timeZone);

let accounts: ServiceAccountHarness;
let app: ZodFastifyInstance;
let cookie: string;

/** Requests to the auth module as Fastify serves it. */
class TimeZoneRequests {
  static async save(props: {
    headers: Record<string, string>;
    body: unknown;
  }): Promise<{ statusCode: number; body: unknown }> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/people/me/time-zone',
      headers: { ...props.headers, 'content-type': 'application/json' },
      payload: JSON.stringify(props.body),
    });
    return { statusCode: response.statusCode, body: response.json() };
  }

  static async stored(): Promise<string> {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    return sessionTimeZoneSchema.parse(response.json());
  }
}

beforeEach(async () => {
  accounts = new ServiceAccountHarness();
  app = await new HttpServer({
    config: {
      corsOrigins: [harnessWebOrigin],
      environment: 'test',
      logLevel: 'silent',
    },
    modules: [accounts.auth],
  }).build();
  cookie = await accounts.signIn();
});

afterEach(async () => {
  await app.close();
});

describe('POST /api/people/me/time-zone', () => {
  it('starts a person in America/New_York before any browser reports', async () => {
    expect(await TimeZoneRequests.stored()).toBe('America/New_York');
  });

  it('saves the zone, and the session lookup returns it', async () => {
    const saved = await TimeZoneRequests.save({
      headers: { cookie },
      body: { timeZone: 'Europe/London' },
    });

    expect(saved).toEqual({
      statusCode: 200,
      body: { timeZone: 'Europe/London' },
    });
    expect(await TimeZoneRequests.stored()).toBe('Europe/London');
  });

  it.each([{ timeZone: 'Mars/Olympus_Mons' }, { timeZone: '+05:00' }, {}])(
    'answers 400 to %j and keeps the stored zone',
    async (body) => {
      const response = await TimeZoneRequests.save({
        headers: { cookie },
        body,
      });

      expect(response).toMatchObject({
        statusCode: 400,
        body: { code: 'TIME_ZONE_REJECTED' },
      });
      expect(await TimeZoneRequests.stored()).toBe('America/New_York');
    },
  );

  it('keeps the zone out of Better Auth’s own profile update', async () => {
    const response = await accounts.post({
      path: '/update-user',
      cookie,
      body: { timeZone: 'Europe/London' },
    });

    expect(response.ok).toBe(false);
    expect(await TimeZoneRequests.stored()).toBe('America/New_York');
  });
});

describe('POST /api/people/me/time-zone for callers who are not a signed-in person', () => {
  it('answers 401 without a session, even to a zone it would refuse', async () => {
    const response = await TimeZoneRequests.save({
      headers: {},
      body: { timeZone: 'nowhere' },
    });

    expect(response).toMatchObject({
      statusCode: 401,
      body: { code: 'SIGN_IN_REQUIRED' },
    });
  });

  it('answers 401 to an API key and to a service principal holding a session', async () => {
    const created = await accounts.createAccount({
      cookie,
      account: {
        kind: 'agent',
        name: 'Rook',
        agentName: 'rook',
        description: 'Reviews pull requests',
        scopes: ['heartbeat:write'],
      },
    });
    const forged = await accounts.forgeSession({
      userId: created.serviceAccount.id,
    });

    const responses = await Promise.all([
      TimeZoneRequests.save({
        headers: { authorization: `Bearer ${created.apiKey.secret}` },
        body: { timeZone: 'Europe/London' },
      }),
      TimeZoneRequests.save({
        headers: { cookie: forged },
        body: { timeZone: 'Europe/London' },
      }),
    ]);

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([401, 401]);
    expect(await TimeZoneRequests.stored()).toBe('America/New_York');
  });
});
