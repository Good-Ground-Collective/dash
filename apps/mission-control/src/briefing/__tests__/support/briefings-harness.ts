import type { PrincipalSession } from '#src/auth/services/identity/identity.ts';
import {
  FixedOwnerTimeZone,
  InMemoryBriefingRepository,
} from '#src/briefing/__tests__/support/in-memory-briefings.ts';
import { FakeBriefingWorkflows } from '#src/briefing/__tests__/support/fake-briefing-workflows.ts';
import { BriefingModule } from '#src/briefing/module.ts';
import { fixedNow } from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import type { BriefingSettings } from '#src/platform/definitions/config/app-config.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

const settings: BriefingSettings = {
  apiKey: 'sk-test',
  model: 'gpt-6-luna',
  prices: {
    inputUsdPerMTok: 0.1,
    cachedInputUsdPerMTok: 0.01,
    outputUsdPerMTok: 0.5,
  },
  monthlyBudgetUsd: 1,
  maxOutputTokens: 4000,
};

/**
 * The briefing module over in-memory runs and an owner in `America/New_York`. A
 * `session=<user id>` cookie signs that person in.
 */
export class BriefingsHarness {
  readonly briefings = new InMemoryBriefingRepository();
  readonly workflows = new FakeBriefingWorkflows();
  readonly module: BriefingModule;
  private app: ZodFastifyInstance | undefined;

  constructor(
    props: {
      configured?: boolean;
      monthlyBudgetUsd?: number;
      ownerTimeZone?: string;
    } = {},
  ) {
    this.module = new BriefingModule({
      briefings: this.briefings,
      ownerTimeZone: new FixedOwnerTimeZone({
        timeZone: props.ownerTimeZone ?? 'America/New_York',
      }),
      workflows: this.workflows,
      identity: {
        session: async ({ headers }): Promise<PrincipalSession | null> => {
          const userId = /session=(?<id>[\w-]+)/u.exec(
            headers.get('cookie') ?? '',
          )?.groups?.['id'];
          return userId === undefined
            ? null
            : { principalId: userId, kind: 'user', expiresAt: fixedNow };
        },
      },
      settings:
        props.configured === false
          ? null
          : { ...settings, monthlyBudgetUsd: props.monthlyBudgetUsd ?? 1 },
    });
  }

  async start(): Promise<ZodFastifyInstance> {
    this.app ??= await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [this.module],
    }).build();
    return this.app;
  }

  async stop(): Promise<void> {
    await this.app?.close();
    this.app = undefined;
  }

  static cookie(userId: string) {
    return { cookie: `session=${userId}` };
  }
}
