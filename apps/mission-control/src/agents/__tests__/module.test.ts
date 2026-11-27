import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  agent,
  bench,
} from '#src/agents/__tests__/support/agent-heartbeat-fixtures.ts';
import { AgentsHarness } from '#src/agents/__tests__/support/agents-harness.ts';
import { serviceAccountListSchema } from '#src/auth/contracts/service-account.ts';

let served: AgentsHarness;

beforeEach(async () => {
  served = await AgentsHarness.start();
});

afterEach(async () => {
  await served.stop();
});

describe('POST /api/agents/:agentName/heartbeats', () => {
  it('records a bench key’s heartbeat for any agent on the bench', async () => {
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
    expect(served.records.heartbeats).toMatchObject([
      { agentName: 'claude-code', benchId: 'studio-mac' },
      { agentName: 'codex', benchId: 'studio-mac' },
    ]);
  });

  it('authenticates before reading the body, and refuses an empty one', async () => {
    const { secret } = await served.keyFor(bench);

    const anonymous = await served.app.inject({
      method: 'POST',
      url: '/api/agents/claude-code/heartbeats',
    });
    const empty = await served.app.inject({
      method: 'POST',
      url: '/api/agents/claude-code/heartbeats',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      payload: '',
    });

    expect(anonymous.statusCode).toBe(401);
    expect(empty.statusCode).toBe(400);
    expect(served.records.heartbeats).toEqual([]);
  });
});

describe('POST /api/agents/:agentName/heartbeats refusals', () => {
  it('rejects a key without heartbeat:write', async () => {
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
    expect(served.records.heartbeats).toEqual([]);
  });

  it('stops accepting a key the moment it is revoked', async () => {
    const { secret, keyId } = await served.keyFor(bench);
    const headers = { authorization: `Bearer ${secret}` };
    const before = await served.report({ agentName: 'claude-code', headers });

    await served.accounts.post({
      path: '/service-accounts/keys/revoke',
      cookie: served.cookie,
      body: { keyId },
    });
    const after = await served.report({ agentName: 'claude-code', headers });

    expect(before.statusCode).toBe(201);
    expect(after).toEqual({ statusCode: 401, code: 'API_KEY_REJECTED' });
    expect(served.records.heartbeats).toHaveLength(1);
  });

  it('stops accepting every key of a revoked account', async () => {
    const { secret, serviceAccountId } = await served.keyFor(bench);

    await served.accounts.post({
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

  it('refuses an agent key once it has expired', async () => {
    const { secret, keyId } = await served.keyFor(agent);
    const stored = served.accounts.tables.apikey.find(
      (row) => row.id === keyId,
    );
    if (stored !== undefined) stored.expiresAt = new Date(Date.now() - 1000);

    const response = await served.report({
      agentName: 'ci-reviewer',
      headers: { authorization: `Bearer ${secret}` },
    });

    expect(stored).toBeDefined();
    expect(response).toEqual({ statusCode: 401, code: 'API_KEY_REJECTED' });
    expect(served.records.heartbeats).toEqual([]);
  });
});

describe('POST /api/agents/:agentName/heartbeats identity', () => {
  it('lets an agent key report only as its own agent', async () => {
    const { secret } = await served.keyFor(agent);
    const headers = { authorization: `Bearer ${secret}` };

    const own = await served.report({ agentName: 'ci-reviewer', headers });
    const other = await served.report({ agentName: 'claude-code', headers });

    expect(own.statusCode).toBe(201);
    expect(other).toEqual({ statusCode: 403, code: 'AGENT_MISMATCH' });
    expect(served.records.heartbeats).toMatchObject([
      { agentName: 'ci-reviewer', benchId: null },
    ]);
  });

  it.each([
    ['no key', {}],
    ['an unknown key', { authorization: 'Bearer dash_dev_not-a-real-key' }],
    ['a session cookie instead of a key', { cookie: 'placeholder' }],
  ])('answers 401 to %s', async (_label, headers) => {
    const sent =
      'cookie' in headers ? { cookie: served.cookie } : { ...headers };

    const response = await served.report({
      agentName: 'claude-code',
      headers: sent,
    });

    expect(response.statusCode).toBe(401);
  });

  it('tracks when each key was last used', async () => {
    const { secret } = await served.keyFor(bench);

    await served.report({
      agentName: 'claude-code',
      headers: { authorization: `Bearer ${secret}` },
    });
    const listed = await served.accounts.get({
      path: '/service-accounts/list',
      cookie: served.cookie,
    });

    const { serviceAccounts } = serviceAccountListSchema.parse(
      await listed.json(),
    );
    expect(serviceAccounts[0]?.keys[0]?.lastUsedAt).not.toBeNull();
  });
});
