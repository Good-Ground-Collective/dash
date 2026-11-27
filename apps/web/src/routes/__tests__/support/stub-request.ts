import type { IncomingMessage } from 'node:http';

/** Reads what the stubs need from a raw Node request. */
export class StubRequest {
  static async body(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
