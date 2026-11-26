import { describe, expect, it } from 'vitest';
import { CookieVisitorContext } from '#lib/server/visitor-context.ts';

class RecordingRender {
  html = '';
  private readonly contentType: string;

  constructor(props: { contentType: string }) {
    this.contentType = props.contentType;
  }

  readonly render = async (
    transformPageChunk: (input: { html: string }) => string,
  ): Promise<Response> => {
    this.html = transformPageChunk({
      html: '<html data-theme="%dash.theme%" data-mode="%dash.mode%">',
    });
    return new Response(this.html, {
      headers: { 'content-type': this.contentType },
    });
  };
}

const visitorContext = new CookieVisitorContext({
  apiBaseUrl: 'https://api.example.test',
});

describe('VisitorContext', () => {
  it('renders the mode cookie into the html and records the session cookie', async () => {
    const cookies = new Map([
      ['dash-mode', 'dark'],
      ['better-auth.session_token', 'token'],
    ]);
    const locals: App.Locals = {
      hasSessionCookie: false,
    };
    const renderer = new RecordingRender({ contentType: 'text/html' });

    await visitorContext.visit({
      cookies: { get: (name) => cookies.get(name) },
      headers: new Headers(),
      locals,
      render: renderer.render,
    });

    expect(renderer.html).toBe(
      '<html data-theme="characters" data-mode="dark">',
    );
    expect(locals).toEqual({
      hasSessionCookie: true,
    });
  });
});

describe('VisitorContext client hints', () => {
  it('asks for the colour-scheme client hint on html responses', async () => {
    const response = await visitorContext.visit({
      cookies: { get: () => undefined },
      headers: new Headers({ 'sec-ch-prefers-color-scheme': 'dark' }),
      locals: {
        hasSessionCookie: false,
      },
      render: new RecordingRender({ contentType: 'text/html; charset=utf-8' })
        .render,
    });

    expect(response.headers.get('accept-ch')).toBe(
      'sec-ch-prefers-color-scheme',
    );
    expect(response.headers.get('critical-ch')).toBe(
      'sec-ch-prefers-color-scheme',
    );
    expect(response.headers.get('vary')).toContain(
      'sec-ch-prefers-color-scheme',
    );
  });

  it('leaves other responses alone', async () => {
    const response = await visitorContext.visit({
      cookies: { get: () => undefined },
      headers: new Headers(),
      locals: {
        hasSessionCookie: false,
      },
      render: new RecordingRender({ contentType: 'application/json' }).render,
    });

    expect(response.headers.get('accept-ch')).toBeNull();
    expect(response.headers.get('critical-ch')).toBeNull();
    expect(response.headers.get('vary')).toBeNull();
  });

  it('refuses an API base URL that is not a URL', () => {
    expect(
      () => new CookieVisitorContext({ apiBaseUrl: 'not a url' }),
    ).toThrow();
  });
});

describe('VisitorContext server-side fetches', () => {
  it('sends the visitor cookie to Mission Control only', async () => {
    const sent: Request[] = [];
    const fetch: typeof globalThis.fetch = async (input) => {
      sent.push(new Request(input));
      return new Response(null, { status: 204 });
    };

    for (const url of [
      'https://api.example.test/api/auth/get-session',
      'https://elsewhere.example.test/data',
    ]) {
      await visitorContext.fetchAsVisitor({
        request: new Request(url),
        browserCookie: 'better-auth.session_token=abc',
        appOrigin: 'https://web.example.test',
        fetch,
      });
    }

    expect(sent.map((request) => request.headers.get('cookie'))).toEqual([
      'better-auth.session_token=abc',
      null,
    ]);
  });
});
