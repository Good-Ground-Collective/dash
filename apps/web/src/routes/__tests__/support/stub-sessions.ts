import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const sessionCookie = 'better-auth.session_token';

/** A session token and the `set-cookie` value that signs the browser in with it. */
export interface IssuedSession {
  token: string;
  cookie: string;
}

/** The session tokens `MissionControlStub` has handed out, and the cookies that carry them. */
export class StubSessions {
  private tokens = new Set<string>();

  clear(): void {
    this.tokens = new Set();
  }

  issue(): IssuedSession {
    const token = randomBytes(16).toString('hex');
    this.tokens.add(token);
    return {
      token,
      cookie: `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax`,
    };
  }

  /** Forgets `token` and returns the `set-cookie` value that clears it. */
  end(token: string | null): string {
    if (token !== null) this.tokens.delete(token);
    return `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  /** The request's session token, or `null` when it has none this stub issued. */
  of(request: IncomingMessage): string | null {
    const pair = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${sessionCookie}=`));
    const token = pair?.slice(sessionCookie.length + 1) ?? '';
    return this.tokens.has(token) ? token : null;
  }
}
