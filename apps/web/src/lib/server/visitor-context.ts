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
export class VisitorContext {
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
      fetch,
    });

  async visit(visit: Visit): Promise<Response> {
    const preference = themePreferenceReader.read({
      cookies: visit.cookies,
      headers: visit.headers,
    });
    visit.locals.themePreference = preference;
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

  /** Makes a server-side request, carrying the visitor's cookies when it goes to Mission Control. */
  async fetchAsVisitor(props: {
    request: Request;
    browserCookie: string | null;
    fetch: typeof fetch;
  }): Promise<Response> {
    return props.fetch(
      this.cookieForwarder.forward({
        request: props.request,
        cookie: props.browserCookie,
      }),
    );
  }
}
