import { afterEach, describe, expect, it } from 'vitest';

import type {
  AgentHeartbeat,
  AgentHeartbeatRecord,
} from '#src/agents/contracts/agent-heartbeat.ts';
import { AgentsModule } from '#src/agents/module.ts';
import type { AgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import {
  harnessWebOrigin,
  ServiceAccountHarness,
} from '#src/auth/__tests__/support/service-account-harness.ts';
import {
  type NewServiceAccount,
  serviceAccountListSchema,
} from '#src/auth/contracts/service-account.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

class InMemoryAgentHeartbeatRepository implements AgentHeartbeatRepository {
  readonly records: AgentHeartbeatRecord[] = [];

  async record(record: AgentHeartbeatRecord): Promise<AgentHeartbeat> {
    this.records.push(record);
    return {
      id: crypto.randomUUID(),
      agentName: record.agentName,
      benchId: record.benchId,
      sentAt: record.sentAt?.toISOString() ?? null,
      receivedAt: new Date().toISOString(),
    };
  }
}

const running: ZodFastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map(async (app) => app.close()));
});

/** Mission Control with auth and agents, a signed-in owner, and keys to report with. */
class ServedAgents {
  readonly harness: ServiceAccountHarness;
  readonly heartbeats: InMemoryAgentHeartbeatRepository;
  readonly app: ZodFastifyInstance;
  readonly cookie: string;

  private constructor(props: {
    harness: ServiceAccountHarness;
    heartbeats: InMemoryAgentHeartbeatRepository;
    app: ZodFastifyInstance;
    cookie: string;
  }) {
    this.harness = props.harness;
    this.heartbeats = props.heartbeats;
    this.app = props.app;
    this.cookie = props.cookie;
  }

  async keyFor(account: NewServiceAccount): Promise<{
    secret: string;
    keyId: string;
    serviceAccountId: string;
  }> {
    const created = await this.harness.createAccount({
      cookie: this.cookie,
      account,
    });
    return {
      secret: created.apiKey.secret,
      keyId: created.apiKey.key.id,
      serviceAccountId: created.serviceAccount.id,
    };
  }

  async report(props: {
    agentName: string;
    headers: Record<string, string>;
  }): Promise<{ statusCode: number; code: string | undefined }> {
    const response = await this.app.inject({
      method: 'POST',
      url: `/api/agents/${props.agentName}/heartbeats`,
      headers: { ...props.headers, 'content-type': 'application/json' },
      payload: JSON.stringify({ sentAt: '2026-11-26T18:00:00.000Z' }),
    });
    const body: { code?: string } = response.json();
    return { statusCode: response.statusCode, code: body.code };
  }

  static async start(): Promise<ServedAgents> {
    const harness = new ServiceAccountHarness();
    const heartbeats = new InMemoryAgentHeartbeatRepository();
    const app = await new HttpServer({
      config: {
        corsOrigins: [harnessWebOrigin],
        environment: 'test',
        logLevel: 'silent',
      },
      modules: [
        harness.auth,
        new AgentsModule({
          authentication: harness.auth.agentAuthentication,
          heartbeatRepository: heartbeats,
        }),
      ],
    }).build();
    running.push(app);
    return new ServedAgents({
      harness,
      heartbeats,
      app,
      cookie: await harness.signIn(),
    });
  }
}

const bench: NewServiceAccount = {
  kind: 'bench',
  name: 'Studio Mac',
  benchId: 'studio-mac',
  description: 'The desk machine',
  scopes: ['heartbeat:write', 'telemetry:write'],
};

const agent: NewServiceAccount = {
  kind: 'agent',
  name: 'CI reviewer',
  agentName: 'ci-reviewer',
  description: 'Runs in GitHub Actions',
  scopes: ['heartbeat:write'],
};

describe('POST /api/agents/:agentName/heartbeats', () => {
  it('records a bench key’s heartbeat for any agent on the bench', async () => {
    const served = await ServedAgents.start();
    const { secret } = await served.keyFor(bench);

    const first = await served.report({
      agentName: 'claude-code',
      headers: { authorization: `Bearer ${secret}` },
    });
    const second = await served.report({
      agentName: 'codex',
      headers: { 'x-api-key': secret },
    });

    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(served.heartbeats.records).toMatchObject([
      { agentName: 'claude-code', benchId: 'studio-mac' },
      { agentName: 'codex', benchId: 'studio-mac' },
    ]);
  });
});

describe('POST /api/agents/:agentName/heartbeats without a body', () => {
  it('authenticates before reading the body, and takes an empty one as a heartbeat', async () => {
    const served = await ServedAgents.start();
    const { secret } = await served.keyFor(bench);

    const anonymous = await served.app.inject({
      method: 'POST',
      url: '/api/agents/claude-code/heartbeats',
    });
    const keyed = await served.app.inject({
      method: 'POST',
      url: '/api/agents/claude-code/heartbeats',
      headers: { authorization: `Bearer ${secret}` },
    });

    expect(anonymous.statusCode).toBe(401);
    expect(keyed.statusCode).toBe(201);
    expect(served.heartbeats.records).toMatchObject([{ sentAt: null }]);
  });
});

describe('POST /api/agents/:agentName/heartbeats refusals', () => {
  it('rejects a key without heartbeat:write', async () => {
    const served = await ServedAgents.start();
    const { secret } = await served.keyFor({
      ...bench,
      scopes: ['telemetry:write'],
    });

    const response = await served.report({
      agentName: 'claude-code',
      headers: { authorization: `Bearer ${secret}` },
    });

    expect(response).toEqual({
      statusCode: 403,
      code: 'API_KEY_SCOPE_MISSING',
    });
    expect(served.heartbeats.records).toEqual([]);
  });

  it('stops accepting a key the moment it is revoked', async () => {
    const served = await ServedAgents.start();
    const { secret, keyId } = await served.keyFor(bench);
    const before = await served.report({
      agentName: 'claude-code',
      headers: { authorization: `Bearer ${secret}` },
    });

    await served.harness.post({
      path: '/service-accounts/keys/revoke',
      cookie: served.cookie,
      body: { keyId },
    });
    const after = await served.report({
      agentName: 'claude-code',
      headers: { authorization: `Bearer ${secret}` },
    });

    expect(before.statusCode).toBe(201);
    expect(after).toEqual({ statusCode: 401, code: 'API_KEY_REJECTED' });
    expect(served.heartbeats.records).toHaveLength(1);
  });

  it('stops accepting every key of a revoked account', async () => {
    const served = await ServedAgents.start();
    const { secret, serviceAccountId } = await served.keyFor(bench);

    await served.harness.post({
      path: '/service-accounts/revoke',
      cookie: served.cookie,
      body: { serviceAccountId },
    });
    const response = await served.report({
      agentName: 'claude-code',
      headers: { authorization: `Bearer ${secret}` },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/agents/:agentName/heartbeats identity', () => {
  it('lets an agent key report only as its own agent', async () => {
    const served = await ServedAgents.start();
    const { secret } = await served.keyFor(agent);

    const own = await served.report({
      agentName: 'ci-reviewer',
      headers: { authorization: `Bearer ${secret}` },
    });
    const other = await served.report({
      agentName: 'claude-code',
      headers: { authorization: `Bearer ${secret}` },
    });

    expect(own.statusCode).toBe(201);
    expect(other).toEqual({ statusCode: 403, code: 'AGENT_MISMATCH' });
    expect(served.heartbeats.records).toMatchObject([
      { agentName: 'ci-reviewer', benchId: null },
    ]);
  });

  it.each([
    ['no key', {}],
    ['an unknown key', { authorization: 'Bearer dash_dev_not-a-real-key' }],
    ['a session cookie instead of a key', { cookie: 'placeholder' }],
  ])('answers 401 to %s', async (_label, headers) => {
    const served = await ServedAgents.start();
    const sent =
      'cookie' in headers ? { cookie: served.cookie } : { ...headers };

    const response = await served.report({
      agentName: 'claude-code',
      headers: sent,
    });

    expect(response.statusCode).toBe(401);
  });

  it('tracks when each key was last used', async () => {
    const served = await ServedAgents.start();
    const { secret } = await served.keyFor(bench);

    await served.report({
      agentName: 'claude-code',
      headers: { authorization: `Bearer ${secret}` },
    });
    const listed = await served.harness.get({
      path: '/service-accounts/list',
      cookie: served.cookie,
    });

    const { serviceAccounts } = serviceAccountListSchema.parse(
      await listed.json(),
    );
    expect(serviceAccounts[0]?.keys[0]?.lastUsedAt).not.toBeNull();
  });
});
