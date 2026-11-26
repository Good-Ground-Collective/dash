/** Mission Control refused a passkey request, or the browser's ceremony didn't finish. `code` is Mission Control's error code. */
export class PasskeyAuthError extends Error {
  override name = 'PasskeyAuthError';
  readonly code: string;
  readonly status: number;

  constructor(props: {
    code: string;
    message?: string | undefined;
    status: number;
  }) {
    super(props.message ?? `Mission Control answered ${props.status}`);
    this.code = props.code;
    this.status = props.status;
  }
}
