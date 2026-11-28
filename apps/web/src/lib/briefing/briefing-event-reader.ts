import { z } from 'zod';
import {
  briefingProgressEventSchema,
  briefingReadyEventSchema,
} from '#lib/api/briefings/briefing-contracts.ts';
import type { BriefingRunEvent } from '#lib/briefing/briefing-run.ts';

const jsonSchema = z.string().transform((value, context) => {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    context.addIssue({ code: 'custom', message: 'The frame is not JSON' });
    return z.NEVER;
  }
});

const progressFrameSchema = jsonSchema
  .pipe(briefingProgressEventSchema)
  .transform((event): BriefingRunEvent => ({ kind: 'progress', ...event }));

const readyFrameSchema = jsonSchema
  .pipe(briefingReadyEventSchema)
  .transform((event): BriefingRunEvent => ({ kind: 'ready', ...event }));

const frameSchemas = new Map<string, z.ZodType<BriefingRunEvent>>([
  ['briefing.progress', progressFrameSchema],
  ['briefing.ready', readyFrameSchema],
]);

/** Reads the data of a `briefing.progress` or `briefing.ready` frame from Mission Control's live events. */
export class BriefingEventReader {
  /** The event names the card listens for. */
  static readonly TYPES: readonly string[] = [...frameSchemas.keys()];

  /** `null` for an event of another type, or a frame that isn't JSON or doesn't match its contract. */
  static read(props: { type: string; data: unknown }): BriefingRunEvent | null {
    const parsed = frameSchemas.get(props.type)?.safeParse(props.data);
    return parsed?.success === true ? parsed.data : null;
  }
}
