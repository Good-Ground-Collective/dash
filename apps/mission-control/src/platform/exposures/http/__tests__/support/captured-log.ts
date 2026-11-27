import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

/** Points a built app's pino logger, and so every request logger, at an in-memory list of lines. */
export class CapturedLog {
  readonly lines: string[] = [];

  attach(app: ZodFastifyInstance): void {
    const stream = Object.getOwnPropertySymbols(app.log).find(
      (symbol) => symbol.description === 'pino.stream',
    );
    if (stream === undefined) {
      throw new Error('Expected pino’s stream on the Fastify logger');
    }
    Object.defineProperty(app.log, stream, {
      value: { write: (line: string) => this.lines.push(line) },
    });
  }

  text(): string {
    return this.lines.join('');
  }
}
