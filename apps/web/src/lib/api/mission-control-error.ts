/** Mission Control answered with a non-2xx status. */
export class MissionControlError extends Error {
  override name = 'MissionControlError';
  readonly status: number;

  constructor(props: { path: string; status: number }) {
    super(`Mission Control answered ${props.path} with ${props.status}`);
    this.status = props.status;
  }
}
