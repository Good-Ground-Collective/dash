import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { sessionCookie } from '#lib/server/session-cookie.ts';

export const originCookieForwarderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type OriginCookieForwarderProps = z.input<
  typeof originCookieForwarderPropsSchema
>;

/** Decides which server-side requests carry the browser's cookies. */
export interface CookieForwarder {
  forward(props: CookieForwarding): Request;
}

/** A server-side request, the browser's Cookie header, and the origin the app is served from. */
export interface CookieForwarding {
  request: Request;
  cookie: string | null;
  appOrigin: string;
}

/**
 * Sends only the session cookie, and only to Mission Control's origin. Every cross-origin request
 * is marked `credentials: 'omit'`, because SvelteKit's server fetch otherwise re-attaches every
 * browser cookie to hosts under the app's. Same-origin requests are left to SvelteKit.
 */
export class OriginCookieForwarder implements CookieForwarder {
  private readonly apiOrigin: string;

  constructor(props: OriginCookieForwarderProps) {
    this.apiOrigin = new URL(
      originCookieForwarderPropsSchema.parse(props).apiBaseUrl,
    ).origin;
  }

  forward(props: CookieForwarding): Request {
    const origin = new URL(props.request.url).origin;
    if (origin === props.appOrigin) return props.request;
    if (origin !== this.apiOrigin) {
      return new Request(props.request, { credentials: 'omit' });
    }

    const session = (props.cookie ?? '')
      .split(';')
      .map((pair) => pair.trim())
      .filter((pair) => sessionCookie.names.includes(pair.split('=')[0] ?? ''));

    const headers = new Headers(props.request.headers);
    headers.delete('cookie');
    if (session.length > 0) headers.set('cookie', session.join('; '));
    return new Request(props.request, { headers, credentials: 'omit' });
  }
}
