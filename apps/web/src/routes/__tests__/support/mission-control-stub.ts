import { randomBytes, randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { z } from 'zod';
import { AppearanceStub } from './appearance-stub.ts';
import { GithubStub } from './github/github-stub.ts';
import { OnboardingStub } from './onboarding-stub.ts';
import { PasskeysStub } from './passkeys-stub.ts';
import { RecoveryCodesStub } from './recovery-codes-stub.ts';
import { RecoveryStub } from './recovery-stub.ts';
import { ServiceAccountsStub } from './service-accounts-stub.ts';
import { SetupStub } from './setup-stub.ts';
import { StubRequest } from './stub-request.ts';
import { WebAuthnOptions } from './webauthn-options.ts';

const sessionCookie = 'better-auth.session_token';
const credentialBodySchema = z.object({
  response: z.object({ id: z.string() }),
  name: z.string().optional(),
});
interface StubPerson {
  id: string;
  name: string;
  email: string;
}

interface StubReply {
  status: number;
  body: object | null;
  cookie?: string;
  headers?: Record<string, string>;
}

/**
 * Stands in for Mission Control's `/api/auth` in the web e2e tests, which run without Postgres.
 * It speaks the same paths and error codes but trusts every WebAuthn response: the real checks
 * are Mission Control's own tests. `POST /__stub/reset` forgets everyone,
 * `POST /__stub/sign-in` signs a person straight in, and `POST /__stub/age-session` makes
 * service account changes and new recovery codes answer `SESSION_NOT_FRESH` until the next
 * passkey sign-in.
 * `POST /__stub/recovery-codes {codes}`, `POST /__stub/break-glass` and
 * `POST /__stub/expire-enrolments` drive recovery (see `RecoveryStub`), and
 * `/recovery-codes` answers as `RecoveryCodesStub` describes. `/integrations/github` is `GithubStub`,
 * and `/onboarding/checklist` is `OnboardingStub`.
 */
export class MissionControlStub {
  private readonly webOrigin: string;
  private person: StubPerson | null = null;
  private readonly passkeys = new PasskeysStub();
  private sessions = new Set<string>();
  private sessionStale = false;
  private readonly appearance = new AppearanceStub();
  private readonly serviceAccounts = new ServiceAccountsStub();
  private readonly setup = new SetupStub();
  private readonly github = new GithubStub({ webOrigin: () => this.webOrigin });
  private readonly onboarding = new OnboardingStub({
    passkeys: () => this.passkeys.all.length,
    githubConnected: () => this.github.connected(),
  });
  private readonly recovery = new RecoveryStub({
    email: () => this.person?.email ?? null,
    webOrigin: () => this.webOrigin,
  });
  private readonly recoveryCodes = new RecoveryCodesStub({
    activate: (codes) => this.recovery.activate(codes),
    remaining: () => this.recovery.remaining(),
    stale: () => this.sessionStale,
  });

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
    StubRequest.allowCors({ response, webOrigin: this.webOrigin });
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/integrations/github/')) {
      const signedIn = this.sessionOf(request) !== null;
      this.github.serve({ request, response, url, signedIn });
      return;
    }
    if (url.pathname === '/onboarding/checklist') {
      const signedIn = this.sessionOf(request) !== null;
      const reply = this.onboarding.checklist({ signedIn });
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
      return;
    }
    const body =
      request.method === 'POST' ? await StubRequest.body(request) : '';
    const reply = this.route({
      path: url.pathname.replace(/^\/api\/auth/u, ''),
      session: this.sessionOf(request),
      body,
      context: url.searchParams.get('context'),
      attachment: url.searchParams.get('authenticatorAttachment'),
    });
    if (reply.cookie !== undefined) {
      response.setHeader('set-cookie', reply.cookie);
    }
    response.writeHead(reply.status, {
      ...reply.headers,
      'content-type': 'application/json',
    });
    response.end(JSON.stringify(reply.body));
  }

  private route(props: {
    path: string;
    session: string | null;
    body: string;
    context: string | null;
    attachment: string | null;
  }): StubReply {
    const { path, session, body } = props;
    switch (path) {
      case '/__stub/reset':
        return this.reset();
      case '/__stub/sign-in':
        return this.signInDirectly();
      case '/__stub/age-session':
        this.sessionStale = true;
        return { status: 200, body: { status: true } };
      case '/get-session':
        return this.getSession(session);
      case '/setup/status':
        return { status: 200, body: { open: this.person === null } };
      case '/setup/check':
        return this.setup.check({ body, signedUp: this.person !== null });
      case '/setup/begin':
        return this.setup.begin({ body, signedUp: this.person !== null });
      case '/passkey/generate-register-options':
        return this.registrationOptions(props);
      case '/passkey/verify-registration':
        return this.register({ session, body });
      case '/passkey/generate-authenticate-options':
        return { status: 200, body: WebAuthnOptions.authentication() };
      case '/passkey/verify-authentication':
        return this.authenticate(body);
      case '/sign-out':
        return this.signOut(session);
      default:
        return this.recovery.route(props) ?? this.manage(props);
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
    const handled =
      this.recoveryCodes.route(props) ?? this.passkeys.route(props);
    if (handled !== null) return handled;
    switch (props.path) {
      case '/appearance/update':
        return this.appearance.save(props.body);
      case '/service-accounts/list':
        return this.serviceAccounts.route(props);
      default:
        return this.sessionStale
          ? this.fail(403, 'SESSION_NOT_FRESH')
          : this.serviceAccounts.route(props);
    }
  }

  private reset(): StubReply {
    this.person = null;
    this.setup.reset();
    this.passkeys.reset();
    this.sessions = new Set();
    this.sessionStale = false;
    this.appearance.reset();
    this.serviceAccounts.reset();
    this.recovery.reset();
    this.recoveryCodes.reset();
    this.github.reset();
    return { status: 200, body: { status: true } };
  }

  /** Signs a person in without a passkey, for suites that test pages behind sign-in. */
  private signInDirectly(): StubReply {
    if (this.person === null) {
      this.person = {
        id: randomUUID(),
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      };
      this.recoveryCodes.seed();
    }
    return this.newSession();
  }

  private getSession(session: string | null): StubReply {
    if (session === null || this.person === null) {
      return { status: 200, body: null };
    }
    const user = this.appearance.withAppearance(this.person);
    return {
      status: 200,
      body: { session: { token: session }, user },
    };
  }

  /** Without a session, `context` names a setup or recovery enrolment, which registration then spends. */
  private registrationOptions(props: {
    session: string | null;
    context: string | null;
    attachment: string | null;
  }): StubReply {
    const recovery =
      props.session === null ? this.recovery.prepare(props.context) : 'none';
    const person =
      recovery === 'ready' || props.session !== null
        ? this.person
        : this.setup.pending;
    if (recovery === 'rejected' || person === null) {
      return this.fail(401, 'PASSKEY_ENROLMENT_REJECTED');
    }
    return {
      status: 200,
      body: WebAuthnOptions.registration({
        ...person,
        passkeys: this.passkeys.all,
        attachment: props.attachment,
      }),
    };
  }

  /** A recovery signs out every other session, as Mission Control does. */
  private register(props: { session: string | null; body: string }): StubReply {
    const input = credentialBodySchema.parse(JSON.parse(props.body || '{}'));
    let signedUp: StubPerson | null = null;
    if (props.session === null) {
      const recovery = this.recovery.complete();
      if (recovery === 'spent') this.sessions = new Set();
      signedUp = recovery === 'spent' ? this.person : this.setup.pending;
      if (recovery === 'rejected' || signedUp === null) {
        return this.fail(401, 'PASSKEY_ENROLMENT_REJECTED');
      }
    }
    const passkey = this.passkeys.add(input);
    if (signedUp === null) return { status: 200, body: passkey };

    if (this.setup.pending !== null) this.recoveryCodes.markUnconfirmed();
    this.person = signedUp;
    this.setup.reset();
    return { ...this.newSession(), body: passkey };
  }

  private authenticate(body: string): StubReply {
    const input = credentialBodySchema.parse(JSON.parse(body || '{}'));
    if (!this.passkeys.knows(input.response.id)) {
      return this.fail(401, 'PASSKEY_NOT_FOUND');
    }
    this.sessionStale = false;
    return this.newSession();
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
}
