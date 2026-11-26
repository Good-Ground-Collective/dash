import { randomBytes, randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { z } from 'zod';
import { ServiceAccountsStub } from './service-accounts-stub.ts';

const sessionCookie = 'better-auth.session_token';
const stubSetupToken = 'stub-setup-token';

const setupBeginSchema = z.object({
  token: z.string(),
  name: z.string(),
  email: z.string(),
});
const credentialBodySchema = z.object({
  response: z.object({ id: z.string() }),
  name: z.string().optional(),
});
const passkeyIdSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

interface StubPasskey {
  id: string;
  credentialId: string;
  name: string | null;
  createdAt: string;
  deviceType: string;
  backedUp: boolean;
}

interface StubPerson {
  id: string;
  name: string;
  email: string;
}

interface StubReply {
  status: number;
  body: object | null;
  cookie?: string;
}

/**
 * Stands in for Mission Control's `/api/auth` in the web e2e tests, which run without Postgres.
 * It speaks the same paths and error codes but trusts every WebAuthn response: the real checks
 * are Mission Control's own tests. `POST /__stub/reset` forgets everyone, and
 * `POST /__stub/sign-in` signs a person straight in.
 */
export class MissionControlStub {
  private readonly webOrigin: string;
  private person: StubPerson | null = null;
  private pendingSetup: StubPerson | null = null;
  private passkeys: StubPasskey[] = [];
  private sessions = new Set<string>();
  private readonly serviceAccounts = new ServiceAccountsStub();

  constructor(props: { webOrigin: string }) {
    this.webOrigin = props.webOrigin;
  }

  listen(props: { port: number }): void {
    createServer((request, response) => {
      void this.serve(request, response);
    }).listen(props.port, 'localhost');
  }

  private async serve(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    response.setHeader('access-control-allow-origin', this.webOrigin);
    response.setHeader('access-control-allow-credentials', 'true');
    response.setHeader('access-control-allow-headers', 'accept, content-type');
    response.setHeader('access-control-allow-methods', 'GET, POST');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    const body = request.method === 'POST' ? await this.readBody(request) : '';
    const reply = this.route({
      path: url.pathname.replace(/^\/api\/auth/u, ''),
      session: this.sessionOf(request),
      body,
    });
    if (reply.cookie !== undefined) {
      response.setHeader('set-cookie', reply.cookie);
    }
    response.writeHead(reply.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(reply.body));
  }

  private route(props: {
    path: string;
    session: string | null;
    body: string;
  }): StubReply {
    const { path, session, body } = props;
    switch (path) {
      case '/__stub/reset':
        return this.reset();
      case '/__stub/sign-in':
        return this.signInDirectly();
      case '/get-session':
        return this.getSession(session);
      case '/setup/status':
        return { status: 200, body: { open: this.person === null } };
      case '/setup/begin':
        return this.beginSetup(body);
      case '/passkey/generate-register-options':
        return this.registrationOptions(session);
      case '/passkey/verify-registration':
        return this.register({ session, body });
      case '/passkey/generate-authenticate-options':
        return this.authenticationOptions();
      case '/passkey/verify-authentication':
        return this.authenticate(body);
      case '/sign-out':
        return this.signOut(session);
      default:
        return this.manage({ path, session, body });
    }
  }

  private manage(props: {
    path: string;
    session: string | null;
    body: string;
  }): StubReply {
    if (props.session === null) {
      return this.fail(401, 'UNAUTHORIZED');
    }
    switch (props.path) {
      case '/passkey/list-user-passkeys':
        return { status: 200, body: this.passkeys };
      case '/passkey/update-passkey':
        return this.rename(props.body);
      case '/passkey/delete-passkey':
        return this.remove(props.body);
      default:
        return this.serviceAccounts.route(props);
    }
  }

  private reset(): StubReply {
    this.person = null;
    this.pendingSetup = null;
    this.passkeys = [];
    this.sessions = new Set();
    this.serviceAccounts.reset();
    return { status: 200, body: { status: true } };
  }

  /** Signs a person in without a passkey, for suites that test pages behind sign-in. */
  private signInDirectly(): StubReply {
    this.person ??= {
      id: randomUUID(),
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    };
    return this.newSession();
  }

  private getSession(session: string | null): StubReply {
    if (session === null || this.person === null) {
      return { status: 200, body: null };
    }
    return {
      status: 200,
      body: { session: { token: session }, user: this.person },
    };
  }

  private beginSetup(body: string): StubReply {
    const input = setupBeginSchema.parse(JSON.parse(body || '{}'));
    if (this.person !== null) return this.fail(403, 'SETUP_CLOSED');
    if (input.token !== stubSetupToken) {
      return this.fail(401, 'SETUP_TOKEN_REJECTED');
    }
    this.pendingSetup = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
    };
    return { status: 200, body: { enrolment: 'setup-enrolment:stub' } };
  }

  private registrationOptions(session: string | null): StubReply {
    const person = session === null ? this.pendingSetup : this.person;
    if (person === null) return this.fail(401, 'PASSKEY_ENROLMENT_REJECTED');
    return {
      status: 200,
      body: {
        challenge: randomBytes(32).toString('base64url'),
        rp: { name: 'Dash', id: 'localhost' },
        user: {
          id: randomBytes(16).toString('base64url'),
          name: person.email,
          displayName: person.name,
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        timeout: 60_000,
        attestation: 'none',
        excludeCredentials: this.passkeys.map((passkey) => ({
          id: passkey.credentialId,
          type: 'public-key',
        })),
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
      },
    };
  }

  private register(props: { session: string | null; body: string }): StubReply {
    const input = credentialBodySchema.parse(JSON.parse(props.body || '{}'));
    const signedUp = props.session === null ? this.pendingSetup : null;
    if (props.session === null && signedUp === null) {
      return this.fail(401, 'PASSKEY_ENROLMENT_REJECTED');
    }
    const passkey: StubPasskey = {
      id: randomUUID(),
      credentialId: input.response.id,
      name: input.name ?? null,
      createdAt: new Date().toISOString(),
      deviceType: 'multiDevice',
      backedUp: true,
    };
    this.passkeys.push(passkey);
    if (signedUp === null) return { status: 200, body: passkey };

    this.person = signedUp;
    this.pendingSetup = null;
    return { ...this.newSession(), body: passkey };
  }

  private authenticationOptions(): StubReply {
    return {
      status: 200,
      body: {
        challenge: randomBytes(32).toString('base64url'),
        rpId: 'localhost',
        timeout: 60_000,
        userVerification: 'required',
        allowCredentials: [],
      },
    };
  }

  private authenticate(body: string): StubReply {
    const input = credentialBodySchema.parse(JSON.parse(body || '{}'));
    const known = this.passkeys.some(
      (passkey) => passkey.credentialId === input.response.id,
    );
    return known ? this.newSession() : this.fail(401, 'PASSKEY_NOT_FOUND');
  }

  private rename(body: string): StubReply {
    const input = passkeyIdSchema.parse(JSON.parse(body || '{}'));
    const passkey = this.passkeys.find(
      (candidate) => candidate.id === input.id,
    );
    if (passkey === undefined) return this.fail(404, 'PASSKEY_NOT_FOUND');
    passkey.name = input.name ?? passkey.name;
    return { status: 200, body: { passkey } };
  }

  private remove(body: string): StubReply {
    const input = passkeyIdSchema.parse(JSON.parse(body || '{}'));
    if (this.passkeys.length <= 1) return this.fail(409, 'LAST_PASSKEY');
    this.passkeys = this.passkeys.filter((passkey) => passkey.id !== input.id);
    return { status: 200, body: { status: true } };
  }

  private signOut(session: string | null): StubReply {
    if (session !== null) this.sessions.delete(session);
    return {
      status: 200,
      body: { success: true },
      cookie: `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    };
  }

  private newSession(): StubReply {
    const token = randomBytes(16).toString('hex');
    this.sessions.add(token);
    return {
      status: 200,
      body: { session: { token }, user: this.person },
      cookie: `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax`,
    };
  }

  private sessionOf(request: IncomingMessage): string | null {
    const pair = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${sessionCookie}=`));
    const token = pair?.slice(sessionCookie.length + 1) ?? '';
    return this.sessions.has(token) ? token : null;
  }

  private fail(status: number, code: string): StubReply {
    return { status, body: { code, message: code } };
  }

  private async readBody(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
