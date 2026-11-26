import type { Handle, HandleFetch } from '@sveltejs/kit/hooks';
import { CookieForwarder } from '#lib/server/cookie-forwarder.ts';
import { sessionCookie } from '#lib/server/session-cookie.ts';
import { documentTheme } from '#lib/theme/document-theme.ts';
import {
  ThemePreferenceReader,
  themePreferenceReader,
} from '#lib/theme/theme-preference-reader.ts';

/** The SvelteKit server hooks: theme attributes during rendering, and cookie forwarding to Mission Control. */
export class ServerHooks {
  private readonly cookieForwarder: CookieForwarder;

  constructor(props: { apiBaseUrl: string }) {
    this.cookieForwarder = new CookieForwarder(props);
  }

  readonly handle: Handle = async ({ event, resolve }) => {
    const preference = themePreferenceReader.read({
      themeCookie: event.cookies.get(ThemePreferenceReader.THEME_COOKIE),
      modeCookie: event.cookies.get(ThemePreferenceReader.MODE_COOKIE),
      colorSchemeHint: event.request.headers.get(
        ThemePreferenceReader.COLOR_SCHEME_HINT,
      ),
    });
    event.locals.themePreference = preference;
    event.locals.hasSessionCookie = sessionCookie.isPresent({
      get: (name) => event.cookies.get(name),
    });
    const response = await resolve(event, {
      transformPageChunk: ({ html }) =>
        documentTheme.apply({ html, preference }),
    });
    if (
      response.headers.get('content-type')?.startsWith('text/html') === true
    ) {
      response.headers.set(
        'accept-ch',
        ThemePreferenceReader.COLOR_SCHEME_HINT,
      );
      response.headers.append('vary', ThemePreferenceReader.COLOR_SCHEME_HINT);
    }
    return response;
  };

  readonly handleFetch: HandleFetch = async ({ event, request, fetch }) =>
    fetch(
      this.cookieForwarder.forward({
        request,
        cookie: event.request.headers.get('cookie'),
      }),
    );
}
