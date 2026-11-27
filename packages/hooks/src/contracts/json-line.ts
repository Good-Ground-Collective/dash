import { z } from 'zod';

/** One line of a JSONL file, parsed. Pipe it into the schema the line should match. */
export const jsonLineSchema = z.string().transform((line, context) => {
  try {
    return JSON.parse(line);
  } catch {
    context.addIssue({ code: 'custom', message: 'Not a JSON line' });
    return z.NEVER;
  }
});
