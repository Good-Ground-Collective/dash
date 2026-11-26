import type { Heartbeat } from '#src/heartbeat/contracts/heartbeat.ts';
import type { HeartbeatRepository } from '#src/heartbeat/repositories/heartbeats/heartbeat-repository.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';

export interface HeartbeatRecorder {
  record(props: { firedAt: Date }): Promise<Heartbeat>;
}

/** Stores a heartbeat and pushes it to connected browsers. */
export class LiveHeartbeatRecorder implements HeartbeatRecorder {
  private readonly liveEvents: LiveEvents;
  private readonly repository: HeartbeatRepository;

  constructor(props: {
    liveEvents: LiveEvents;
    repository: HeartbeatRepository;
  }) {
    this.liveEvents = props.liveEvents;
    this.repository = props.repository;
  }

  async record(props: { firedAt: Date }): Promise<Heartbeat> {
    const heartbeat = await this.repository.record(props);
    this.liveEvents.publish({ type: 'heartbeat', data: heartbeat });
    return heartbeat;
  }
}
