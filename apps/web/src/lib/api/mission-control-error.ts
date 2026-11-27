/** Mission Control refused with a non-2xx status, or answered 2xx with a body that isn't JSON. `code` is Mission Control's error code, or `UNKNOWN`. */
export class MissionControlError extends Error {
  override name = 'MissionControlError';
  readonly status: number;
  readonly code: string;

  constructor(props: {
    path: string;
    status: number;
    code?: string | undefined;
    message?: string | undefined;
  }) {
    super(
      props.message ??
        `Mission Control answered ${props.path} with ${props.status}`,
    );
    this.status = props.status;
    this.code = props.code ?? 'UNKNOWN';
  }
}
