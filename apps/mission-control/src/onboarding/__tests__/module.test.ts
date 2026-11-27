import { afterEach, describe, expect, it } from 'vitest';

import type { PasskeyBrowser } from '#src/auth/__tests__/support/passkey-browser.ts';
import {
  PasskeyIdentity,
  passkeyWebOrigin,
} from '#src/auth/__tests__/support/passkey-identity.ts';
import { acmeInstallation } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import { InMemoryConnectionRepository } from '#src/connections/__tests__/support/in-memory-connections.ts';
import {
  type SetupChecklistReport,
  setupChecklistSchema,
} from '#src/onboarding/contracts/setup-checklist.ts';
import { OnboardingModule } from '#src/onboarding/module.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

const running: ZodFastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map(async (app) => app.close()));
});

/** The onboarding module over Dash's real Better Auth, with connections in memory. */
class FreshAccount {
  readonly fixture = new PasskeyIdentity();
  readonly connections = new InMemoryConnectionRepository();
  private app: ZodFastifyInstance | undefined;

  async start(): Promise<ZodFastifyInstance> {
    this.app ??= await new HttpServer({
      config: {
        corsOrigins: [passkeyWebOrigin],
        environment: 'test',
        logLevel: 'silent',
      },
      modules: [
        new OnboardingModule({
          identity: this.fixture.identity,
          connections: this.connections,
        }),
      ],
    }).build();
    running.push(this.app);
    return this.app;
  }

  async checklist(browser: PasskeyBrowser): Promise<SetupChecklistReport> {
    const response = await (
      await this.start()
    ).inject({
      url: '/onboarding/checklist',
      headers: { cookie: browser.cookieHeader() },
    });
    return setupChecklistSchema.parse(response.json());
  }

  /** Each item's status by id. */
  async done(browser: PasskeyBrowser): Promise<Record<string, boolean>> {
    const report = await this.checklist(browser);
    return Object.fromEntries(report.items.map((item) => [item.id, item.done]));
  }

  async connectGitHub(): Promise<void> {
    await this.connections.saveOwned({
      provider: 'github',
      connectedBy: this.fixture.tables.user[0]?.id ?? '',
      installation: acmeInstallation,
    });
  }
}

describe('OnboardingModule', () => {
  it('shows a fresh account both items open', async () => {
    const account = new FreshAccount();
    const browser = await account.fixture.firstPerson();

    expect(await account.done(browser)).toEqual({
      connectGitHub: false,
      secondPasskey: false,
    });
  });

  it('ticks each item off as soon as its condition holds', async () => {
    const account = new FreshAccount();
    const browser = await account.fixture.firstPerson();

    await account.connectGitHub();
    expect(await account.done(browser)).toEqual({
      connectGitHub: true,
      secondPasskey: false,
    });

    await browser.registerPasskey({ name: 'Phone' });
    expect(await account.done(browser)).toEqual({
      connectGitHub: true,
      secondPasskey: true,
    });
  });
});
