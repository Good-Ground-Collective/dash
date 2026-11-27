import type { FastifyRequest } from 'fastify';

import type { Identity } from '#src/auth/services/identity/identity.ts';

/** Who sent a request, for routes only a person may use. */
export class SignedInPerson {
  private readonly identity: Pick<Identity, 'session'>;

  constructor(props: { identity: Pick<Identity, 'session'> }) {
    this.identity = props.identity;
  }

  /** The signed-in person's id, or null without a session or for a service principal. */
  async of(request: FastifyRequest): Promise<string | null> {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      for (const item of [value ?? []].flat()) {
        headers.append(name, item);
      }
    }
    const session = await this.identity.session({ headers });
    return session?.kind === 'user' ? session.principalId : null;
  }
}
