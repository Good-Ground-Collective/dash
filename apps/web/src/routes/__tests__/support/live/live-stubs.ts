import type { ServerResponse } from 'node:http';
import { AgentSessionRows } from './agents/agent-session-rows.ts';
import { AgentsStub } from './agents/agents-stub.ts';
import { BriefingsStub } from './briefings/briefings-stub.ts';
import { EventStreamStub } from './event-stream-stub.ts';
import { NeedsYouStub } from './needs-you/needs-you-stub.ts';

/** Mission Control's live pieces for `MissionControlStub`: `/events`, which `BriefingsStub`, `NeedsYouStub` and `AgentsStub` all publish on, and the three stubs themselves. */
export class LiveStubs {
  private readonly events = new EventStreamStub();
  private readonly briefings = new BriefingsStub({ events: this.events });
  private readonly needsYou = new NeedsYouStub({ events: this.events });
  private readonly agents = new AgentsStub({
    events: this.events,
    alsoReported: () =>
      this.needsYou.reportedSessions().map((session) =>
        AgentSessionRows.row({
          ...session,
          agentId: null,
          status: 'working',
          minutesAgo: 1,
        }),
      ),
  });

  /** False when the request is none of theirs. */
  serve(props: {
    response: ServerResponse;
    url: URL;
    signedIn: boolean;
  }): boolean {
    const { pathname } = props.url;
    if (pathname === '/events') {
      this.events.open(props);
    } else if (pathname.startsWith('/briefing')) {
      this.briefings.serve(props);
    } else if (pathname.startsWith('/api/needs-you')) {
      this.needsYou.serve(props);
    } else if (
      pathname === '/api/agents/sessions' ||
      pathname.startsWith('/api/agents/__stub')
    ) {
      this.agents.serve(props);
    } else {
      return false;
    }
    return true;
  }

  reset(): void {
    this.briefings.reset();
    this.needsYou.reset();
    this.agents.reset();
    this.events.drop();
  }
}
