import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

import { z } from 'zod';

import { jsonLineSchema } from '#src/contracts/json-line.js';

const assistantEntrySchema = z.looseObject({
  type: z.literal('assistant'),
  message: z.looseObject({
    content: z.array(
      z.looseObject({ type: z.string(), text: z.string().optional() }),
    ),
  }),
});

const assistantLineSchema = jsonLineSchema.pipe(assistantEntrySchema);

/** Reads the last thing the agent said from a Claude Code transcript, a JSONL file of conversation entries. */
export class TranscriptReader {
  /** Only the end of the file is read, so a long session's transcript costs the same as a short one's. */
  static readonly TAIL_BYTES = 256 * 1024;

  /** The text of the last assistant entry, or `undefined` when the transcript is missing, unreadable or has none. */
  static lastAssistantText(
    transcriptPath: string | undefined,
  ): string | undefined {
    if (transcriptPath === undefined) {
      return undefined;
    }

    try {
      const lines = TranscriptReader.readTail(transcriptPath).split('\n');
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const text = TranscriptReader.assistantText(lines[index] ?? '');
        if (text !== undefined) {
          return text;
        }
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private static readTail(transcriptPath: string): string {
    const descriptor = openSync(transcriptPath, 'r');
    try {
      const { size } = fstatSync(descriptor);
      const length = Math.min(size, TranscriptReader.TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      readSync(descriptor, buffer, 0, length, size - length);
      return buffer.toString('utf8');
    } finally {
      closeSync(descriptor);
    }
  }

  private static assistantText(line: string): string | undefined {
    if (!line.includes('"assistant"')) {
      return undefined;
    }

    const parsed = assistantLineSchema.safeParse(line);
    if (!parsed.success) {
      return undefined;
    }

    const text = parsed.data.message.content
      .flatMap((block) =>
        block.type === 'text' && block.text ? [block.text] : [],
      )
      .join('\n')
      .trim();
    return text === '' ? undefined : text;
  }
}
