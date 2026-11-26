/** Copies the browser's cookies onto server-side requests bound for Mission Control. */
export class CookieForwarder {
  private readonly apiOrigin: string;

  constructor(props: { apiBaseUrl: string }) {
    this.apiOrigin = new URL(props.apiBaseUrl).origin;
  }

  forward(props: { request: Request; cookie: string | null }): Request {
    if (
      props.cookie === null ||
      new URL(props.request.url).origin !== this.apiOrigin
    ) {
      return props.request;
    }
    const headers = new Headers(props.request.headers);
    headers.set('cookie', props.cookie);
    return new Request(props.request, { headers });
  }
}
