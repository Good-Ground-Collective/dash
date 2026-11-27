import { z } from 'zod';

import { agentSessionsSchema } from '#src/agents/contracts/agent-session.ts';
import { AgentSessionsSignInRequiredError } from '#src/agents/errors.ts';
import type { AgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';
import { AgentSessionRollup } from '#src/agents/services/agent-session-rollup/agent-session-rollup.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';
import { SignedInPerson } from '#src/auth/services/signed-in-person/signed-in-person.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

const agentSessionsRoutesPropsSchema = z.object({
  sessions: z.custom<AgentSessionRepository>(),
  identity: z.custom<Pick<Identity, 'session'>>(),
});

const currentWindowMilliseconds = 24 * 60 * 60 * 1000;

/** `GET /api/agents/sessions`, for a signed-in person: sessions where anything reported in the last 24 hours, with their subagents rolled up under them. */
export class AgentSessionsRoutes {
  private readonly sessions: AgentSessionRepository;
  private readonly person: SignedInPerson;

  constructor(props: z.input<typeof agentSessionsRoutesPropsSchema>) {
    const parsed = agentSessionsRoutesPropsSchema.parse(props);
    this.sessions = parsed.sessions;
    this.person = new SignedInPerson({ identity: parsed.identity });
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      '/api/agents/sessions',
      { schema: { response: { 200: agentSessionsSchema } } },
      async (request) => {
        if ((await this.person.of(request)) === null) {
          throw new AgentSessionsSignInRequiredError();
        }

        const states = await this.sessions.listUpdatedSince({
          since: new Date(Date.now() - currentWindowMilliseconds),
        });
        return { sessions: AgentSessionRollup.sessions(states) };
      },
    );
  }
}
