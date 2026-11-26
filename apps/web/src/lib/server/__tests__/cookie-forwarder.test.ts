import { describe, expect, it } from 'vitest';
import { OriginCookieForwarder } from '#lib/server/cookie-forwarder.ts';

const appOrigin = 'https://web.example.test';

const forwarder = new OriginCookieForwarder({
  apiBaseUrl: 'https://api.example.test',
});

describe('OriginCookieForwarder', () => {
  it('adds the cookie to requests for Mission Control', () => {
    const request = new Request(
      'https://api.example.test/api/auth/get-session',
    );
    const forwarded = forwarder.forward({
      request,
      appOrigin,
      cookie: 'better-auth.session_token=abc',
    });
    expect(forwarded.headers.get('cookie')).toBe(
      'better-auth.session_token=abc',
    );
  });

  it('forwards only the session cookie', () => {
    const request = new Request(
      'https://api.example.test/api/auth/get-session',
    );
    const forwarded = forwarder.forward({
      request,
      appOrigin,
      cookie: 'dash-mode=dark; better-auth.session_token=abc; other=x',
    });
    expect(forwarded.headers.get('cookie')).toBe(
      'better-auth.session_token=abc',
    );
    expect(forwarded.credentials).toBe('omit');
  });

  it('sends no cookie when the browser has no session cookie', () => {
    const request = new Request(
      'https://api.example.test/api/auth/get-session',
    );
    const forwarded = forwarder.forward({
      request,
      appOrigin,
      cookie: 'dash-mode=dark',
    });
    expect(forwarded.headers.get('cookie')).toBeNull();
    expect(forwarded.credentials).toBe('omit');
  });
});

describe('OriginCookieForwarder other origins', () => {
  it('never sends the cookie to another origin', () => {
    const request = new Request('https://elsewhere.example.test/data');
    const forwarded = forwarder.forward({
      request,
      appOrigin,
      cookie: 'better-auth.session_token=abc',
    });
    expect(forwarded.headers.get('cookie')).toBeNull();
    expect(forwarded.credentials).toBe('omit');
  });

  it('leaves same-origin requests to SvelteKit', () => {
    const request = new Request('https://web.example.test/api/local');
    expect(
      forwarder.forward({ request, appOrigin, cookie: 'dash-mode=dark' }),
    ).toBe(request);
  });

  it('keeps SvelteKit from attaching cookies when the browser sent none', () => {
    const request = new Request(
      'https://api.example.test/api/auth/get-session',
    );
    const forwarded = forwarder.forward({ request, appOrigin, cookie: null });
    expect(forwarded.headers.get('cookie')).toBeNull();
    expect(forwarded.credentials).toBe('omit');
  });

  it('refuses an API base URL that is not a URL', () => {
    expect(
      () => new OriginCookieForwarder({ apiBaseUrl: 'not a url' }),
    ).toThrow();
  });
});
