import { describe, expect, it } from 'vitest';
import { ConnectResults } from '#lib/connections/connect-results.ts';

/** The setup step's URL as GitHub's round trip leaves it. */
class Landing {
  static at(query: string): URL {
    return new URL(`https://dash.example.test/setup/github${query}`);
  }
}

describe('ConnectResults.fromUrl', () => {
  it('reads each outcome GitHub’s round trip can end with', () => {
    expect(
      ConnectResults.fromUrl(Landing.at('?connect=linked&provider=github')),
    ).toEqual({
      tone: 'ok',
      message:
        'GitHub is connected. Install the app on the accounts Dash should read.',
    });
    expect(
      ConnectResults.fromUrl(Landing.at('?connect=installed&provider=github'))
        ?.tone,
    ).toBe('ok');
    expect(
      ConnectResults.fromUrl(Landing.at('?connect=requested&provider=github')),
    ).toEqual({
      tone: 'info',
      message:
        'Request sent. The account appears here once an owner installs the app.',
    });
  });

  it('explains each error reason, and falls back for unknown ones', () => {
    const reasons = [
      'signed-out',
      'state',
      'denied',
      'not-yours',
      'linked-elsewhere',
      'provider',
      'constructor',
    ];
    const messages = reasons.map(
      (reason) =>
        ConnectResults.fromUrl(
          Landing.at(`?connect=error&provider=github&reason=${reason}`),
        )?.message,
    );

    expect(new Set(messages).size).toBe(6);
    expect(messages.at(-1)).toBe('GitHub didn’t finish connecting. Try again.');
    expect(messages.at(-2)).toBe(messages.at(-1));
    expect(
      ConnectResults.fromUrl(Landing.at('?connect=error&provider=github'))
        ?.tone,
    ).toBe('bad');
  });

  it('ignores other providers, unknown outcomes and plain visits', () => {
    expect(ConnectResults.fromUrl(Landing.at(''))).toBeNull();
    expect(
      ConnectResults.fromUrl(Landing.at('?connect=linked&provider=gitlab')),
    ).toBeNull();
    expect(
      ConnectResults.fromUrl(Landing.at('?connect=toString&provider=github')),
    ).toBeNull();
  });
});

describe('ConnectResults.withoutResult', () => {
  it('drops the result keys and keeps the rest', () => {
    const clean = ConnectResults.withoutResult(
      Landing.at('?connect=error&provider=github&reason=state&tab=1'),
    );

    expect(clean?.href).toBe('https://dash.example.test/setup/github?tab=1');
  });

  it('answers null when there is nothing to remove', () => {
    expect(ConnectResults.withoutResult(Landing.at('?tab=1'))).toBeNull();
    expect(
      ConnectResults.withoutResult(
        Landing.at('?connect=linked&provider=gitlab&reason=x'),
      ),
    ).toBeNull();
    expect(
      ConnectResults.withoutResult(Landing.at('?reason=audit')),
    ).toBeNull();
  });
});
