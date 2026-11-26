import { describe, expect, it } from 'vitest';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import { HttpServiceAccounts } from '#lib/api/service-accounts.ts';

const baseUrl = 'https://api.example.test';

class RecordingFetch {
  readonly calls: { url: string; init: RequestInit | undefined }[] = [];
  private readonly response: () => Response;

  constructor(props: { response: () => Response }) {
    this.response = props.response;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    this.calls.push({ url: String(input), init });
    return this.response();
  };
}

describe('HttpServiceAccounts', () => {
  it('creates an account with credentials and returns the key once', async () => {
    const recorder = new RecordingFetch({
      response: () =>
        Response.json({
          serviceAccount: {
            id: 'a1',
            kind: 'bench',
            name: 'Studio Mac',
            benchId: 'studio-mac',
            agentName: null,
            description: 'The desk machine',
            scopes: ['heartbeat:write'],
            createdAt: '2026-11-26T18:00:00.000Z',
            keys: [],
          },
          apiKey: {
            key: {
              id: 'k1',
              start: 'dash_live_AbCdEf',
              scopes: ['heartbeat:write'],
              createdAt: '2026-11-26T18:00:00.000Z',
              expiresAt: null,
              lastUsedAt: null,
            },
            secret: 'dash_live_AbCdEfSecret',
          },
        }),
    });
    const accounts = new HttpServiceAccounts({
      baseUrl,
      fetch: recorder.fetch,
    });

    const created = await accounts.create({
      kind: 'bench',
      name: 'Studio Mac',
      benchId: 'studio-mac',
      description: 'The desk machine',
      scopes: ['heartbeat:write'],
    });

    expect(created.apiKey.secret).toBe('dash_live_AbCdEfSecret');
    expect(recorder.calls[0]?.url).toBe(
      'https://api.example.test/api/auth/service-accounts/create',
    );
    expect(recorder.calls[0]?.init?.credentials).toBe('include');
  });
});

describe('HttpServiceAccounts new keys', () => {
  it('sends only the account: Mission Control picks the scopes', async () => {
    const recorder = new RecordingFetch({
      response: () =>
        Response.json({
          key: {
            id: 'k2',
            start: 'dash_dev_AbCdEf',
            scopes: ['heartbeat:write'],
            createdAt: '2026-11-26T18:00:00.000Z',
            expiresAt: null,
            lastUsedAt: null,
          },
          secret: 'dash_dev_AbCdEfSecret',
        }),
    });
    const accounts = new HttpServiceAccounts({
      baseUrl,
      fetch: recorder.fetch,
    });

    const issued = await accounts.issueKey({ serviceAccountId: 'a1' });

    expect(issued.key.scopes).toEqual(['heartbeat:write']);
    expect(recorder.calls[0]?.init?.body).toBe(
      JSON.stringify({ serviceAccountId: 'a1' }),
    );
  });
});

describe('HttpServiceAccounts failures', () => {
  it('carries Mission Control’s error code', async () => {
    const recorder = new RecordingFetch({
      response: () =>
        Response.json(
          { code: 'SESSION_NOT_FRESH', message: 'Sign in again' },
          { status: 403 },
        ),
    });
    const accounts = new HttpServiceAccounts({
      baseUrl,
      fetch: recorder.fetch,
    });

    const failure = await accounts
      .revokeKey({ keyId: 'k1' })
      .catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(MissionControlError);
    expect(failure).toMatchObject({ code: 'SESSION_NOT_FRESH', status: 403 });
  });

  it('keeps the status when the error body isn’t JSON', async () => {
    const recorder = new RecordingFetch({
      response: () => new Response('<html>Bad gateway</html>', { status: 502 }),
    });
    const accounts = new HttpServiceAccounts({
      baseUrl,
      fetch: recorder.fetch,
    });

    const failure = await accounts
      .revokeKey({ keyId: 'k1' })
      .catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(MissionControlError);
    expect(failure).toMatchObject({ status: 502, code: 'UNKNOWN' });
  });
});
