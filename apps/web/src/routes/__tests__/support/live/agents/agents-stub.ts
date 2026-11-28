import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import { AgentScenarios } from './agent-scenarios.ts';
import { AgentSessionRows, type StubAgentRow } from './agent-session-rows.ts';

const scenarioSchema = z.enum(AgentScenarios.SCENARIOS);
const changeSchema = z.enum(AgentScenarios.CHANGES);

/** The shared event stream the stub publishes on. */
interface AgentEvents {
  publish(frame: { type: string; data: object }): void;
}

interface StubJson {
  status: number;
  body: object;
}

/**
 * Mission Control's `GET /api/agents/sessions` for `MissionControlStub`, with
 * `agent.session.updated` on the shared event stream. `POST
 * /api/agents/__stub/scenario?name=` sets the sessions to `empty` or `several`
 * without any event, and `POST /api/agents/__stub/change?name=` sends one named
 * change as a heartbeat would. Sessions another stub reports, such as the ones
 * behind open Needs you items, are listed too.
 */
export class AgentsStub {
  private rows = new Map<string, StubAgentRow>();
  private readonly events: AgentEvents;
  private readonly alsoReported: () => StubAgentRow[];

  constructor(props: {
    events: AgentEvents;
    alsoReported: () => StubAgentRow[];
  }) {
    this.events = props.events;
    this.alsoReported = props.alsoReported;
  }

  reset(): void {
    this.rows = new Map();
  }

  serve(props: {
    response: ServerResponse;
    url: URL;
    signedIn: boolean;
  }): void {
    const reply = this.route(props);
    props.response.writeHead(reply.status, {
      'content-type': 'application/json',
    });
    props.response.end(JSON.stringify(reply.body));
  }

  private route(props: { url: URL; signedIn: boolean }): StubJson {
    const { pathname, searchParams } = props.url;
    if (pathname === '/api/agents/__stub/scenario') {
      const name = scenarioSchema.parse(searchParams.get('name'));
      const rows = name === 'several' ? AgentScenarios.several() : [];
      this.rows = new Map(rows.map((row) => [AgentSessionRows.key(row), row]));
      return { status: 200, body: { scenario: name } };
    }
    if (pathname === '/api/agents/__stub/change') {
      const name = changeSchema.parse(searchParams.get('name'));
      const row = AgentScenarios.change(name);
      this.rows.set(AgentSessionRows.key(row), row);
      this.events.publish({ type: 'agent.session.updated', data: row });
      return { status: 200, body: { changed: name } };
    }
    if (!props.signedIn) {
      return { status: 401, body: { code: 'SIGN_IN_REQUIRED' } };
    }
    return { status: 200, body: { sessions: this.sessions() } };
  }

  private sessions(): object[] {
    const held = new Set([...this.rows.keys()]);
    const others = this.alsoReported().filter(
      (row) => !held.has(AgentSessionRows.key(row)),
    );
    return AgentSessionRows.sessions([...this.rows.values(), ...others]);
  }
}
