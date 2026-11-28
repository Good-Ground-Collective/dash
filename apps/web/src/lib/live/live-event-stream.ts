import type { z } from 'zod';

/** A kind of live event Mission Control publishes, and the payload it carries once validated. */
export interface LiveEventDefinition<T> {
  readonly name: string;
  readonly schema: z.ZodType<T>;
}

export interface LiveOpen {
  /** True when the connection was lost and came back, so events may have been missed. */
  readonly reconnected: boolean;
}

export interface LiveSubscription<T> {
  readonly definition: LiveEventDefinition<T>;
  /** Called with each payload that matches the definition's schema. Anything else is dropped. */
  readonly onEvent: (payload: T) => void;
  /** Called whenever the connection opens, and straight away when subscribing to one that is already open. */
  readonly onOpen?: (opened: LiveOpen) => void;
}

/** Mission Control's `/events` stream, shared by every part of the page that follows it. */
export interface LiveEventStream {
  /** Returns the function that ends the subscription. The connection closes with the last one. */
  subscribe<T>(subscription: LiveSubscription<T>): () => void;
}
