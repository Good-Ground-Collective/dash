import { describe, expect, it } from 'vitest';
import { CookieForwarder } from '#lib/server/cookie-forwarder.ts';

const forwarder = new CookieForwarder({
  apiBaseUrl: 'https://api.example.test',
});

describe('CookieForwarder', () => {
  it('adds the cookie to requests for Mission Control', () => {
    const request = new Request(
      'https://api.example.test/api/auth/get-session',
    );
    const forwarded = forwarder.forward({ request, cookie: 'session=abc' });
    expect(forwarded.headers.get('cookie')).toBe('session=abc');
  });

  it('never sends the cookie to another origin', () => {
    const request = new Request('https://elsewhere.example.test/data');
    const forwarded = forwarder.forward({ request, cookie: 'session=abc' });
    expect(forwarded.headers.get('cookie')).toBeNull();
  });

  it('passes requests through when the browser sent no cookie', () => {
    const request = new Request(
      'https://api.example.test/api/auth/get-session',
    );
    expect(forwarder.forward({ request, cookie: null })).toBe(request);
  });
});
