export class HeartbeatNotRecordedError extends Error {
  override name = 'HeartbeatNotRecordedError';

  constructor() {
    super('Insert into example_heartbeats returned no row');
  }
}
