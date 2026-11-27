import type { IncomingMessage, ServerResponse } from 'node:http';

/** Reads what the stubs need from a raw Node request. */
export class StubRequest {
  static async body(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  /** Lets the web app at `webOrigin` call the stub with credentials and read `Retry-After`. */
  static allowCors(props: {
    response: ServerResponse;
    webOrigin: string;
  }): void {
    const { response } = props;
    response.setHeader('access-control-allow-origin', props.webOrigin);
    response.setHeader('access-control-allow-credentials', 'true');
    response.setHeader('access-control-allow-headers', 'accept, content-type');
    response.setHeader('access-control-allow-methods', 'GET, POST');
    response.setHeader('access-control-expose-headers', 'retry-after');
  }
}
