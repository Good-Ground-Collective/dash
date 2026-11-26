import type { Cookies } from '@sveltejs/kit';
import type { Handle, HandleFetch } from '@sveltejs/kit/hooks';
import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import {
  type CookieForwarder,
  OriginCookieForwarder,
} from '#lib/server/cookie-forwarder.ts';
import { sessionCookie } from '#lib/server/session-cookie.ts';
import { documentTheme } from '#lib/theme/document-theme.ts';
import { themePreferenceReader } from '#lib/theme/theme-preference-reader.ts';

export const visitorContextPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type VisitorContextProps = z.input<typeof visitorContextPropsSchema>;

/** One incoming request, reduced to what the visitor context reads and writes. */
export interface Visit {
  cookies: Pick<Cookies, 'get'>;
  headers: Headers;
  locals: App.Locals;
  render: (
    transformPageChunk: (input: { html: string }) => string,
  ) => Promise<Response>;
}

/** Works out how each visitor sees Dash, and lets server renders act as them toward Mission Control. */
export interface VisitorContext {
  readonly handle: Handle;
  readonly handleFetch: HandleFetch;
}

/** A server-side request made on the visitor's behalf. */
export interface VisitorFetch {
  request: Request;
  browserCookie: string | null;
  appOrigin: string;
  fetch: typeof fetch;
}

/** Reads the theme and session from request cookies, and forwards them to Mission Control's origin. */
export class CookieVisitorContext implements VisitorContext {
  private readonly cookieForwarder: CookieForwarder;

  constructor(props: VisitorContextProps) {
    this.cookieForwarder = new OriginCookieForwarder(
      visitorContextPropsSchema.parse(props),
    );
  }

  readonly handle: Handle = async ({ event, resolve }) =>
    this.visit({
      cookies: event.cookies,
      headers: event.request.headers,
      locals: event.locals,
      render: (transformPageChunk) => resolve(event, { transformPageChunk }),
    });

  readonly handleFetch: HandleFetch = async ({ event, request, fetch }) =>
    this.fetchAsVisitor({
      request,
      browserCookie: event.request.headers.get('cookie'),
      appOrigin: event.url.origin,
      fetch,
    });

  async visit(visit: Visit): Promise<Response> {
    const preference = themePreferenceReader.read({
      cookies: visit.cookies,
      headers: visit.headers,
    });
    visit.locals.hasSessionCookie = sessionCookie.isPresent({
      get: (name) => visit.cookies.get(name),
    });

    const response = await visit.render(({ html }) =>
      documentTheme.apply({ html, preference }),
    );

    if (
      response.headers.get('content-type')?.startsWith('text/html') === true
    ) {
      const hint = themePreferenceReader.clientHint;
      response.headers.set('accept-ch', hint);
      response.headers.set('critical-ch', hint);
      response.headers.append('vary', hint);
    }

    return response;
  }

  async fetchAsVisitor(props: VisitorFetch): Promise<Response> {
    return props.fetch(
      this.cookieForwarder.forward({
        request: props.request,
        cookie: props.browserCookie,
        appOrigin: props.appOrigin,
      }),
    );
  }
}
