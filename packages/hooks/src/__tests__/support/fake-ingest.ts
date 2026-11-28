import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { text } from 'node:stream/consumers';

import { z } from 'zod';

const batchSchema = z.object({
  heartbeats: z.array(
    z.looseObject({
      payload: z.looseObject({ sessionId: z.string(), seq: z.int() }),
    }),
  ),
});

const addressSchema = z.looseObject({ port: z.int().positive() });

/** `up` answers normally; `refuse` answers `refusalStatus`; `store-then-hang` stores the batch and never answers, like a crash after the commit. */
export type FakeIngestMode = 'up' | 'refuse' | 'store-then-hang';

/**
 * Mission Control's batch ingest route on a local port: it checks the bearer key, answers one
 * result per heartbeat and stores each `(sessionId, seq)` once, as the real route does.
 */
export class FakeIngest {
  readonly stored: { sessionId: string; seq: number }[] = [];
  readonly invalidSeqs = new Set<number>();
  mode: FakeIngestMode = 'up';
  refusalStatus: 401 | 403 = 401;
  requests = 0;
  sent = 0;

  private server: Server;
  private hung: (() => void) | undefined;
  private readonly hangs: Promise<void>;
  private port = 0;

  private constructor() {
    this.server = this.createServer();
    this.hangs = new Promise((resolve) => {
      this.hung = resolve;
    });
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Resolves when a `store-then-hang` request has stored its batch and is left hanging. */
  untilHung(): Promise<void> {
    return this.hangs;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Listens again on the same port after `stop`, as Mission Control coming back would. */
  async restart(): Promise<void> {
    this.server = this.createServer();
    await this.listen();
  }

  seqs(): number[] {
    return this.stored.map(({ seq }) => seq);
  }

  private async listen(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server.listen(this.port, '127.0.0.1', () => resolve()),
    );
    this.port = addressSchema.parse(this.server.address()).port;
  }

  private createServer(): Server {
    return createServer((request, response) => {
      void this.handle(request, response);
    });
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    this.requests += 1;
    const body = batchSchema.parse(JSON.parse(await text(request)));
    const expectedPath = `/api/agents/${FakeIngest.REPORTER}/heartbeats/batch`;
    const authorized =
      request.headers.authorization === `Bearer ${FakeIngest.API_KEY}`;

    if (request.url !== expectedPath) {
      response.writeHead(404).end();
      return;
    }
    if (this.mode === 'refuse') {
      response.writeHead(this.refusalStatus).end();
      return;
    }
    if (!authorized) {
      response.writeHead(401).end();
      return;
    }

    this.sent += body.heartbeats.length;
    const results = body.heartbeats.map(({ payload }) => this.store(payload));
    if (this.mode === 'store-then-hang') {
      this.hung?.();
      return;
    }
    response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ results }));
  }

  private store(payload: { sessionId: string; seq: number }) {
    if (this.invalidSeqs.has(payload.seq)) {
      return {
        outcome: 'invalid',
        issues: [{ path: 'payload.seq', message: 'rejected by the test' }],
      };
    }
    const seen = this.stored.some(
      (row) => row.sessionId === payload.sessionId && row.seq === payload.seq,
    );
    if (seen) {
      return { outcome: 'duplicate', heartbeat: {} };
    }

    this.stored.push({ sessionId: payload.sessionId, seq: payload.seq });
    return { outcome: 'created', heartbeat: {} };
  }

  static readonly API_KEY = 'dash_dev_relay-test-key-0123456789';
  static readonly REPORTER = 'test-laptop';

  static async start(): Promise<FakeIngest> {
    const ingest = new FakeIngest();
    await ingest.listen();
    return ingest;
  }
}
