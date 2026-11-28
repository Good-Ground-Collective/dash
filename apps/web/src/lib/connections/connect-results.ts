/** How a banner reads: `ok` and `info` are announced politely, `bad` as an alert. */
export type ConnectResultTone = 'ok' | 'info' | 'bad';

export interface ConnectResult {
  tone: ConnectResultTone;
  message: string;
}

/** The query keys Mission Control's GitHub callbacks add to `returnTo`. */
const resultKeys = ['connect', 'provider', 'reason'] as const;

const outcomes = new Map<string, ConnectResult>([
  [
    'linked',
    {
      tone: 'ok',
      message:
        'GitHub is connected. Install the app on the accounts Dash should read.',
    },
  ],
  [
    'installed',
    {
      tone: 'ok',
      message:
        'Installed. Dash can read the repositories you picked on GitHub.',
    },
  ],
  [
    'requested',
    {
      tone: 'info',
      message:
        'Request sent. The account appears here once an owner installs the app.',
    },
  ],
]);

const errorReasons = new Map<string, string>([
  [
    'signed-out',
    'Your Dash session ended before GitHub sent you back. Try again.',
  ],
  [
    'state',
    'That GitHub link expired or belonged to another session. Try again.',
  ],
  [
    'request-unrecorded',
    'GitHub sent your request, but its link had expired, so Dash didn’t record it. Find the organisation again to request it here.',
  ],
  ['denied', 'GitHub access wasn’t granted. Connect again when you’re ready.'],
  [
    'not-yours',
    'That installation belongs to a GitHub account you can’t manage, so Dash didn’t record it.',
  ],
  [
    'linked-elsewhere',
    'That GitHub account is already linked to another Dash account.',
  ],
]);

const fallbackError = 'GitHub didn’t finish connecting. Try again.';

/** Reads the result GitHub's round trip left in the URL, and removes it so a reload doesn't repeat it. */
export class ConnectResults {
  /** The banner for `?connect=…&provider=github`, or `null` when the URL carries none. */
  static fromUrl(url: URL): ConnectResult | null {
    const params = url.searchParams;
    const outcome = params.get('connect');
    if (outcome === null || params.get('provider') !== 'github') return null;
    if (outcome === 'error') {
      const reason = params.get('reason') ?? '';
      return {
        tone: 'bad',
        message: errorReasons.get(reason) ?? fallbackError,
      };
    }
    return outcomes.get(outcome) ?? null;
  }

  /** The same URL without a GitHub result's keys, or `null` when it carries none. Another provider's result is left for its own page. */
  static withoutResult(url: URL): URL | null {
    const params = url.searchParams;
    if (!params.has('connect') || params.get('provider') !== 'github') {
      return null;
    }
    const clean = new URL(url);
    for (const key of resultKeys) clean.searchParams.delete(key);
    return clean;
  }
}
