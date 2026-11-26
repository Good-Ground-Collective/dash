import { memoryAdapter } from 'better-auth/adapters/memory';
import { makeSignature } from 'better-auth/crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryServicePrincipalRepository } from '#src/auth/__tests__/support/in-memory-service-principals.ts';
import { AuthModule } from '#src/auth/module.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

const secret = 'test-secret-that-is-at-least-32-characters';
const webOrigin = 'http://localhost:5173';

const running: ZodFastifyInstance[] = [];

class ServedAuth {
  readonly module = new AuthModule({
    store: {
      storage: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
        passkey: [],
        setupToken: [],
        apikey: [],
      }),
    },
    servicePrincipalRepository: new InMemoryServicePrincipalRepository(),
    apiKeyPrefix: 'dash_dev_',
    secret,
    baseUrl: 'http://localhost:3000',
    webOrigin,
    trustedOrigins: [webOrigin],
    secureCookies: false,
  });

  async build(): Promise<ZodFastifyInstance> {
    return new HttpServer({
      config: {
        corsOrigins: [webOrigin],
        environment: 'test',
        logLevel: 'silent',
      },
      modules: [this.module],
    }).build();
  }

  async signIn(): Promise<string> {
    const context = await this.module.identity.auth.$context;
    const person = await context.internalAdapter.createUser(
      {
        name: 'Ada',
        email: 'ada@example.com',
      },
      { method: 'test' },
    );
    const session = await context.internalAdapter.createSession(person.id);
    const signature = await makeSignature(session.token, secret);
    return `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
  }

  /** Signs a person in, then serves the module. Closed after each test. */
  static async start(): Promise<{ app: ZodFastifyInstance; cookie: string }> {
    const served = new ServedAuth();
    const cookie = await served.signIn();
    const app = await served.build();
    running.push(app);
    return { app, cookie };
  }
}

afterEach(async () => {
  await Promise.all(running.splice(0).map(async (app) => app.close()));
});

describe('AuthModule session lookup', () => {
  it('answers the web app’s session lookup with the signed-in person', async () => {
    const served = await ServedAuth.start();

    const response = await served.app.inject({
      url: '/api/auth/get-session',
      headers: { cookie: served.cookie, origin: webOrigin },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(webOrigin);
    expect(response.json()).toMatchObject({
      user: { email: 'ada@example.com', kind: 'user' },
    });
  });

  it('answers null without a session cookie', async () => {
    const served = await ServedAuth.start();

    const response = await served.app.inject({ url: '/api/auth/get-session' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toBeNull();
  });
});

describe('AuthModule setup', () => {
  it('opens setup at boot while nobody has signed up', async () => {
    const served = new ServedAuth();
    const app = await served.build();
    running.push(app);
    await app.ready();

    const response = await app.inject({ url: '/api/auth/setup/status' });

    expect(response.json()).toEqual({ open: true });
  });

  it('keeps setup closed at boot once a person exists', async () => {
    const served = await ServedAuth.start();

    const response = await served.app.inject({ url: '/api/auth/setup/status' });

    expect(response.json()).toEqual({ open: false });
  });
});

describe('AuthModule requests', () => {
  it('passes POST bodies through and returns every Set-Cookie line', async () => {
    const served = await ServedAuth.start();

    const response = await served.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: {
        cookie: served.cookie,
        origin: webOrigin,
        'content-type': 'application/json',
      },
      payload: '{}',
    });
    const after = await served.app.inject({
      url: '/api/auth/get-session',
      headers: { cookie: served.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.cookies).toContainEqual(
      expect.objectContaining({
        name: 'better-auth.session_token',
        maxAge: 0,
      }),
    );
    expect(after.json()).toBeNull();
  });

  it('refuses a cookie-bearing POST from an origin outside the CORS allowlist', async () => {
    const served = await ServedAuth.start();

    const response = await served.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: {
        cookie: served.cookie,
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      payload: '{}',
    });

    expect(response.statusCode).toBe(403);
  });
});
