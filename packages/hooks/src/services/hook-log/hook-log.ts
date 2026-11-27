import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

const fileHookLogPropsSchema = z.object({
  logPath: z.string().min(1),
  maxBytes: z
    .int()
    .positive()
    .default(1024 * 1024)
    .describe(
      'Past this size the log moves to `<logPath>.1`, replacing the previous one.',
    ),
});

export type FileHookLogProps = z.input<typeof fileHookLogPropsSchema>;

/** Where a hook reports what went wrong, since it never fails the session or prints to it. */
export interface HookLog {
  failure(props: { event: string; cause: unknown; now: Date }): void;
}

/** A `HookLog` in a size-capped file next to the outbox. Writing to it never throws. */
export class FileHookLog implements HookLog {
  private readonly logPath: string;
  private readonly maxBytes: number;

  constructor(props: FileHookLogProps) {
    const valid = fileHookLogPropsSchema.parse(props);

    this.logPath = valid.logPath;
    this.maxBytes = valid.maxBytes;
  }

  failure(props: { event: string; cause: unknown; now: Date }): void {
    const detail =
      props.cause instanceof Error
        ? (props.cause.stack ?? `${props.cause.name}: ${props.cause.message}`)
        : String(props.cause);

    try {
      mkdirSync(path.dirname(this.logPath), { recursive: true });
      this.rotateIfFull();
      appendFileSync(
        this.logPath,
        `${props.now.toISOString()} ${props.event || '-'} pid=${process.pid} ${detail}\n`,
      );
    } catch {
      return;
    }
  }

  private rotateIfFull(): void {
    const size = statSync(this.logPath, { throwIfNoEntry: false })?.size ?? 0;
    if (size > this.maxBytes) {
      renameSync(this.logPath, `${this.logPath}.1`);
    }
  }
}
