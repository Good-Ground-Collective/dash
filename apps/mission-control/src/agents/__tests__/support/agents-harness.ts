import { z } from 'zod';

import { AgentHeartbeatFixtures } from '#src/agents/__tests__/support/agent-heartbeat-fixtures.ts';
import { InMemoryAgentRecords } from '#src/agents/__tests__/support/in-memory-agent-records.ts';
import { AgentsModule } from '#src/agents/module.ts';
import {
  harnessWebOrigin,
  ServiceAccountHarness,
} from '#src/auth/__tests__/support/service-account-harness.ts';
import type { NewServiceAccount } from '#src/auth/contracts/service-account.ts';
import type { LiveEvent } from '#src/live/contracts/live-event.ts';
import { InProcessLiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

const responseBodySchema = z.record(z.string(), z.json());

const agentsHarnessPropsSchema = z.object({
  accounts: z.instanceof(ServiceAccountHarness),
  records: z.instanceof(InMemoryAgentRecords),
  published: z
    .custom<LiveEvent[]>((value) => Array.isArray(value))
    .describe('The array live events are pushed into, kept by reference.'),
  app: z.custom<ZodFastifyInstance>(),
  cookie: z.string().min(1),
});

/** A JSON answer from Mission Control. */
export interface AgentsResponse {
  statusCode: number;
  body: z.infer<typeof responseBodySchema>;
}

/** Mission Control with auth and agents over in-memory records, a signed-in owner, and the live events it published. */
export class AgentsHarness {
  readonly accounts: ServiceAccountHarness;
  readonly records: InMemoryAgentRecords;
  readonly published: LiveEvent[];
  readonly app: ZodFastifyInstance;
  readonly cookie: string;
  private nextSeq = 0;
  private benchAuthorization = '';

  private constructor(props: z.input<typeof agentsHarnessPropsSchema>) {
    const parsed = agentsHarnessPropsSchema.parse(props);
    this.accounts = parsed.accounts;
    this.records = parsed.records;
    this.published = parsed.published;
    this.app = parsed.app;
    this.cookie = parsed.cookie;
  }

  /** Creates a service account and answers its key's secret and ids. */
  async keyFor(account: NewServiceAccount): Promise<{
    secret: string;
    keyId: string;
    serviceAccountId: string;
  }> {
    const created = await this.accounts.createAccount({
      cookie: this.cookie,
      account,
    });
    return {
      secret: created.apiKey.secret,
      keyId: created.apiKey.key.id,
      serviceAccountId: created.serviceAccount.id,
    };
  }

  /** Creates a bench key that `send` and `sendBatch` report with. */
  async useBenchKey(account: NewServiceAccount): Promise<void> {
    const { secret } = await this.keyFor(account);
    this.benchAuthorization = `Bearer ${secret}`;
  }

  /** Posts `json` to `seth-laptop/heartbeats` with the bench key. */
  async send(json: string): Promise<AgentsResponse> {
    return this.post({
      path: 'seth-laptop/heartbeats',
      headers: { authorization: this.benchAuthorization },
      json,
    });
  }

  /** Posts `json` to `seth-laptop/heartbeats/batch` with the bench key. */
  async sendBatch(json: string): Promise<AgentsResponse> {
    return this.post({
      path: 'seth-laptop/heartbeats/batch',
      headers: { authorization: this.benchAuthorization },
      json,
    });
  }

  /** Posts `json` to `/api/agents/:path`, such as `seth-laptop/heartbeats`. */
  async post(props: {
    path: string;
    headers: Record<string, string>;
    json: string;
  }): Promise<AgentsResponse> {
    const response = await this.app.inject({
      method: 'POST',
      url: `/api/agents/${props.path}`,
      headers: { ...props.headers, 'content-type': 'application/json' },
      payload: props.json,
    });
    return {
      statusCode: response.statusCode,
      body: responseBodySchema.parse(response.json()),
    };
  }

  /** Reports a new heartbeat as `reporterName`, each with the next `seq`. */
  async report(props: {
    reporterName: string;
    headers: Record<string, string>;
  }): Promise<{
    statusCode: number;
    code: AgentsResponse['body'][string] | undefined;
  }> {
    const response = await this.post({
      path: `${props.reporterName}/heartbeats`,
      headers: props.headers,
      json: JSON.stringify(
        AgentHeartbeatFixtures.message({ seq: this.nextSeq++ }),
      ),
    });
    return { statusCode: response.statusCode, code: response.body['code'] };
  }

  async sessions(props: {
    headers: Record<string, string>;
  }): Promise<AgentsResponse> {
    const response = await this.app.inject({
      method: 'GET',
      url: '/api/agents/sessions',
      headers: props.headers,
    });
    return {
      statusCode: response.statusCode,
      body: responseBodySchema.parse(response.json()),
    };
  }

  async stop(): Promise<void> {
    await this.app.close();
  }

  static async start(): Promise<AgentsHarness> {
    const accounts = new ServiceAccountHarness();
    const records = new InMemoryAgentRecords();
    const liveEvents = new InProcessLiveEvents();
    const published: LiveEvent[] = [];
    liveEvents.subscribe((event) => published.push(event));

    const app = await new HttpServer({
      config: {
        corsOrigins: [harnessWebOrigin],
        environment: 'test',
        logLevel: 'silent',
      },
      modules: [
        accounts.auth,
        new AgentsModule({
          authentication: accounts.auth.agentAuthentication,
          identity: accounts.auth.identity,
          heartbeatRepository: records,
          sessionRepository: records,
          liveEvents,
        }),
      ],
    }).build();
    return new AgentsHarness({
      accounts,
      records,
      published,
      app,
      cookie: await accounts.signIn(),
    });
  }
}
