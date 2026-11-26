import { EventEmitter } from 'node:events';

import {
  type LiveEvent,
  liveEventSchema,
} from '#src/live/contracts/live-event.ts';

export type LiveEventListener = (event: LiveEvent) => void;

/** Fans server-side events out to connected browsers. */
export interface LiveEvents {
  publish(event: LiveEvent): void;
  /** Returns a function that removes the listener. */
  subscribe(listener: LiveEventListener): () => void;
}

/** Single-process fan-out. A multi-instance deploy needs a shared channel such as Postgres `LISTEN`/`NOTIFY`. */
export class InProcessLiveEvents implements LiveEvents {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  publish(event: LiveEvent): void {
    this.emitter.emit('event', liveEventSchema.parse(event));
  }

  subscribe(listener: LiveEventListener): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
