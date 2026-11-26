/** Fastify answers with `statusCode` and `code`. */
export class AgentMismatchError extends Error {
  override name = 'AgentMismatchError';
  readonly statusCode = 403;
  readonly code = 'AGENT_MISMATCH';

  constructor(props: { own: string; named: string }) {
    super(
      `This key belongs to agent “${props.own}” and can't report as “${props.named}”.`,
    );
  }
}

export class AgentHeartbeatNotRecordedError extends Error {
  override name = 'AgentHeartbeatNotRecordedError';

  constructor() {
    super('Insert into agent_heartbeat returned no row');
  }
}
