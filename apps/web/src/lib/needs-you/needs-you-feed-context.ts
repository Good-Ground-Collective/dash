import { createContext } from 'svelte';
import type { NeedsYouFeed } from '#lib/needs-you/live-needs-you.ts';

/** The tab's Needs you list, set by the root layout for the bubble. */
export const [getNeedsYouFeed, setNeedsYouFeed] = createContext<NeedsYouFeed>();
