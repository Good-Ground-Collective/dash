import type { ServerResponse } from 'node:http';
import { BriefingsStub } from './briefings/briefings-stub.ts';
import { EventStreamStub } from './event-stream-stub.ts';
import { NeedsYouStub } from './needs-you/needs-you-stub.ts';

/** Mission Control's live pieces for `MissionControlStub`: `/events`, which `BriefingsStub` and `NeedsYouStub` both publish on, and the two stubs themselves. */
export class LiveStubs {
  private readonly events = new EventStreamStub();
  private readonly briefings = new BriefingsStub({ events: this.events });
  private readonly needsYou = new NeedsYouStub({ events: this.events });

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
    } else if (
      pathname.startsWith('/api/needs-you') ||
      pathname === '/api/agents/sessions'
    ) {
      this.needsYou.serve(props);
    } else {
      return false;
    }
    return true;
  }

  reset(): void {
    this.briefings.reset();
    this.needsYou.reset();
    this.events.drop();
  }
}
