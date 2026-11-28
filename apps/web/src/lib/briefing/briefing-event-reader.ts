import {
  briefingProgressEventSchema,
  briefingReadyEventSchema,
} from '#lib/api/briefings/briefing-contracts.ts';
import type { BriefingRunEvent } from '#lib/briefing/briefing-run.ts';
import type { LiveEventDefinition } from '#lib/live/live-event-stream.ts';

/** The `briefing.progress` and `briefing.ready` events on Mission Control's live events, as the run state reads them. */
export class BriefingEventReader {
  static readonly PROGRESS: LiveEventDefinition<BriefingRunEvent> = {
    name: 'briefing.progress',
    schema: briefingProgressEventSchema.transform(
      (event): BriefingRunEvent => ({ kind: 'progress', ...event }),
    ),
  };

  static readonly READY: LiveEventDefinition<BriefingRunEvent> = {
    name: 'briefing.ready',
    schema: briefingReadyEventSchema.transform((event): BriefingRunEvent => ({
      kind: 'ready',
      ...event,
    })),
  };
}
