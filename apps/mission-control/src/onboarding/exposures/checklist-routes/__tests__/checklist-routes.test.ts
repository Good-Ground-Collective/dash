import { afterEach, describe, expect, it } from 'vitest';

import type { PrincipalSession } from '#src/auth/services/identity/identity.ts';
import { setupChecklistSchema } from '#src/onboarding/contracts/setup-checklist.ts';
import { OnboardingModule } from '#src/onboarding/module.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

const adaId = '00000000-0000-4000-8000-00000000000a';
const benchId = '00000000-0000-4000-8000-00000000000b';
const webOrigin = 'http://localhost:5173';

const running: ZodFastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map(async (app) => app.close()));
});

/** The module behind a fake session: `session=<id>` signs Ada in, `service=<id>` a service principal. */
class ChecklistServer {
  static async start(props: {
    connected: boolean;
  }): Promise<ZodFastifyInstance> {
    const module = new OnboardingModule({
      identity: {
        session: async ({ headers }): Promise<PrincipalSession | null> => {
          const found = /(?<kind>session|service)=(?<id>[\w-]+)/u.exec(
            headers.get('cookie') ?? '',
          )?.groups;
          if (found?.['id'] === undefined) return null;
          return {
            principalId: found['id'],
            kind: found['kind'] === 'service' ? 'service' : 'user',
            expiresAt: new Date(Date.now() + 60_000),
          };
        },
      },
      connections: { exists: async () => props.connected },
      initiatives: { anyInitiative: async () => false },
    });

    const app = await new HttpServer({
      config: {
        corsOrigins: [webOrigin],
        environment: 'test',
        logLevel: 'silent',
      },
      modules: [module],
    }).build();
    running.push(app);
    return app;
  }
}

describe('GET /onboarding/checklist', () => {
  it('answers each item’s status for the signed-in person', async () => {
    const app = await ChecklistServer.start({ connected: false });

    const response = await app.inject({
      url: '/onboarding/checklist',
      headers: { cookie: `session=${adaId}` },
    });

    expect(response.statusCode).toBe(200);
    expect(setupChecklistSchema.parse(response.json())).toEqual({
      items: [
        { id: 'connectGitHub', done: false },
        { id: 'createInitiative', done: false },
      ],
    });
  });

  it('refuses a visitor who isn’t signed in', async () => {
    const app = await ChecklistServer.start({ connected: true });

    const response = await app.inject({ url: '/onboarding/checklist' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' });
  });

  it('refuses a service principal', async () => {
    const app = await ChecklistServer.start({ connected: true });

    const response = await app.inject({
      url: '/onboarding/checklist',
      headers: { cookie: `service=${benchId}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' });
  });
});
