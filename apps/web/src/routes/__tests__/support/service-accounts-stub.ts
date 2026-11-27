import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

const scopesSchema = z.array(z.enum(['heartbeat:write', 'telemetry:write']));
const hueSchema = z
  .enum([
    'amber',
    'green',
    'blue',
    'rose',
    'violet',
    'teal',
    'orange',
    'neutral',
  ])
  .default('neutral');

const newAccountSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('bench'),
    name: z.string(),
    description: z.string(),
    benchId: z.string(),
    hue: hueSchema,
    scopes: scopesSchema,
  }),
  z.object({
    kind: z.literal('agent'),
    name: z.string(),
    description: z.string(),
    agentName: z.string(),
    hue: hueSchema,
    scopes: scopesSchema,
  }),
]);
const accountRefSchema = z.object({ serviceAccountId: z.string() });
const keyRefSchema = z.object({ keyId: z.string() });

interface StubKey {
  id: string;
  start: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

interface StubAccount {
  id: string;
  kind: 'bench' | 'agent';
  name: string;
  benchId: string | null;
  agentName: string | null;
  description: string;
  hue: string;
  scopes: string[];
  createdAt: string;
  keys: StubKey[];
}

interface StubIssuedKey {
  key: StubKey;
  secret: string;
}

export interface StubAnswer {
  status: number;
  body: object;
}

/** Mission Control's `/service-accounts` endpoints for the web e2e tests, in memory. Keys are random and never checked. */
export class ServiceAccountsStub {
  private accounts: StubAccount[] = [];

  reset(): void {
    this.accounts = [];
  }

  route(props: { path: string; body: string }): StubAnswer {
    const body: unknown = JSON.parse(props.body || '{}');
    switch (props.path) {
      case '/service-accounts/list':
        return { status: 200, body: { serviceAccounts: this.accounts } };
      case '/service-accounts/create':
        return this.create(newAccountSchema.parse(body));
      case '/service-accounts/keys/create':
        return this.issue(accountRefSchema.parse(body));
      case '/service-accounts/keys/revoke':
        return this.revokeKey(keyRefSchema.parse(body));
      case '/service-accounts/revoke':
        return this.revokeAccount(accountRefSchema.parse(body));
      default:
        return { status: 404, body: { code: 'NOT_FOUND' } };
    }
  }

  private create(input: z.infer<typeof newAccountSchema>): StubAnswer {
    const identifier = input.kind === 'bench' ? input.benchId : input.agentName;
    if (
      this.accounts.some(
        (account) => (account.benchId ?? account.agentName) === identifier,
      )
    ) {
      return {
        status: 409,
        body: {
          code: 'SERVICE_ACCOUNT_TAKEN',
          message: `A service account for “${identifier}” already exists.`,
        },
      };
    }
    const account: StubAccount = {
      id: randomUUID(),
      kind: input.kind,
      name: input.name,
      benchId: input.kind === 'bench' ? input.benchId : null,
      agentName: input.kind === 'agent' ? input.agentName : null,
      description: input.description,
      hue: input.hue,
      scopes: input.scopes,
      createdAt: new Date().toISOString(),
      keys: [],
    };
    this.accounts.push(account);
    const apiKey = this.newKey({ account });
    return { status: 200, body: { serviceAccount: account, apiKey } };
  }

  private issue(input: z.infer<typeof accountRefSchema>): StubAnswer {
    const account = this.accounts.find(
      (candidate) => candidate.id === input.serviceAccountId,
    );
    if (account === undefined) {
      return { status: 404, body: { code: 'SERVICE_ACCOUNT_NOT_FOUND' } };
    }
    return {
      status: 200,
      body: this.newKey({ account }),
    };
  }

  private revokeKey(input: z.infer<typeof keyRefSchema>): StubAnswer {
    for (const account of this.accounts) {
      account.keys = account.keys.filter((key) => key.id !== input.keyId);
    }
    return { status: 200, body: { success: true } };
  }

  private revokeAccount(input: z.infer<typeof accountRefSchema>): StubAnswer {
    this.accounts = this.accounts.filter(
      (account) => account.id !== input.serviceAccountId,
    );
    return { status: 200, body: { success: true } };
  }

  private newKey(props: { account: StubAccount }): StubIssuedKey {
    const secret = `dash_dev_${randomBytes(32).toString('hex')}`;
    const key: StubKey = {
      id: randomUUID(),
      start: secret.slice(0, 15),
      scopes: props.account.scopes,
      createdAt: new Date().toISOString(),
      expiresAt:
        props.account.kind === 'agent'
          ? new Date(Date.now() + 90 * 86_400_000).toISOString()
          : null,
      lastUsedAt: null,
    };
    props.account.keys.push(key);
    return { key, secret };
  }
}
