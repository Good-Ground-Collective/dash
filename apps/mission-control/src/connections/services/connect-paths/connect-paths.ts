import { providerIdSchema } from '@dash/integrations-core';
import { z } from 'zod';

export const connectPathsPropsSchema = z.object({
  provider: providerIdSchema,
  baseUrl: z
    .url({ protocol: /^https?$/u })
    .transform((url) => url.replace(/\/+$/u, ''))
    .describe(
      "Mission Control's public origin, where the provider sends people back.",
    ),
});

/** One provider's connect paths, built once so the authorize URL's redirect always matches the callback route that serves it. */
export class ConnectPaths {
  readonly provider: string;
  /** Where the provider's routes live: `/integrations/<provider>`. */
  readonly prefix: string;
  /** The OAuth callback as the provider must see it, on Mission Control's public origin. */
  readonly callbackUrl: string;
  /** Where the web app's connect step lives, for a request that names no `returnTo`. */
  readonly defaultReturnTo: string;

  constructor(props: z.input<typeof connectPathsPropsSchema>) {
    const { provider, baseUrl } = connectPathsPropsSchema.parse(props);
    this.provider = provider;
    this.prefix = `/integrations/${provider}`;
    this.callbackUrl = `${baseUrl}${this.prefix}/callback`;
    this.defaultReturnTo = `/setup/${provider}`;
  }
}
