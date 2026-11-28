import type { LiveEventDefinition } from '#lib/live/live-event-stream.ts';
import {
  type NeedsYouItem,
  needsYouItemSchema,
} from '#lib/needs-you/needs-you-contracts.ts';

/** The Needs you events on Mission Control's `/events`. Both carry the item. */
export class NeedsYouLiveEvents {
  static readonly OPENED: LiveEventDefinition<NeedsYouItem> = {
    name: 'needs-you.opened',
    schema: needsYouItemSchema,
  };

  static readonly RESOLVED: LiveEventDefinition<NeedsYouItem> = {
    name: 'needs-you.resolved',
    schema: needsYouItemSchema,
  };
}
