import { createContext } from 'svelte';
import type { LiveEventStream } from '#lib/live/live-event-stream.ts';

/** The tab's one live event stream, set by the root layout. */
export const [getLiveEventStream, setLiveEventStream] =
  createContext<LiveEventStream>();
