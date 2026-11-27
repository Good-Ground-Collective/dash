/** One provider's connect paths, built once so the authorize URL's redirect always matches the callback route that serves it. */
export class ConnectPaths {
  readonly provider: string;
  /** Where the provider's routes live: `/integrations/<provider>`. */
  readonly prefix: string;
  /** The OAuth callback as the provider must see it, on Mission Control's public origin. */
  readonly callbackUrl: string;
  /** Where the web app's connect step lives, for a request that names no `returnTo`. */
  readonly defaultReturnTo: string;

  constructor(props: {
    provider: string;
    /** Mission Control's public origin, where the provider sends people back. */
    baseUrl: string;
  }) {
    this.provider = props.provider;
    this.prefix = `/integrations/${props.provider}`;
    this.callbackUrl = `${props.baseUrl}${this.prefix}/callback`;
    this.defaultReturnTo = `/setup/${props.provider}`;
  }
}
