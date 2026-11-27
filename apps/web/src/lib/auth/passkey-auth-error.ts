/** Mission Control refused a passkey request, or the browser's ceremony didn't finish. `code` is Mission Control's error code. */
export class PasskeyAuthError extends Error {
  override name = 'PasskeyAuthError';
  readonly code: string;
  readonly status: number;
  /** How long Mission Control asked to wait, from `Retry-After`. Undefined when it didn't say. */
  readonly retryAfterSeconds: number | undefined;

  constructor(props: {
    code: string;
    message?: string | undefined;
    status: number;
    retryAfterSeconds?: number | undefined;
  }) {
    super(props.message ?? `Mission Control answered ${props.status}`);
    this.code = props.code;
    this.status = props.status;
    this.retryAfterSeconds = props.retryAfterSeconds;
  }

  /** Seconds from a `Retry-After` header in its delay form. Undefined for a missing, dated or malformed one. */
  static retryAfterSeconds(header: string | null): number | undefined {
    const value = header?.trim() ?? '';
    return /^\d+$/u.test(value) ? Number(value) : undefined;
  }
}
