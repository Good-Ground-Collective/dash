import type { ServerResponse } from 'node:http';

/** Mission Control's `GET /events` for `MissionControlStub`: one stream every stub publishes its live events on. */
export class EventStreamStub {
  private readonly streams = new Set<ServerResponse>();

  /** Opens a stream for a signed-in person and answers 401 to anyone else. */
  open(props: { response: ServerResponse; signedIn: boolean }): void {
    const { response } = props;
    if (!props.signedIn) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 'SIGN_IN_REQUIRED' }));
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
    });
    response.write('retry: 300\n\n');
    this.streams.add(response);
    response.once('close', () => this.streams.delete(response));
  }

  publish(frame: { type: string; data: object }): void {
    for (const stream of this.streams) {
      stream.write(
        `event: ${frame.type}\ndata: ${JSON.stringify(frame.data)}\n\n`,
      );
    }
  }

  count(): number {
    return this.streams.size;
  }

  /** Ends every open stream, as a restart of Mission Control would. */
  drop(): void {
    for (const stream of this.streams) {
      stream.end();
    }
    this.streams.clear();
  }
}
