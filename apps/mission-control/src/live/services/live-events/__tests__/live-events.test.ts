import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { InProcessLiveEvents } from '#src/live/services/live-events/live-events.ts';

describe('InProcessLiveEvents', () => {
  it('rejects an event type that would break the SSE frame', () => {
    const liveEvents = new InProcessLiveEvents();

    expect(() =>
      liveEvents.publish({ type: 'a\ndata: x', data: null }),
    ).toThrow(ZodError);
  });
});
