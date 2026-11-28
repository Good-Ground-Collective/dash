import { afterEach, describe, expect, it, vi } from 'vitest';

import { RelayConfig } from '#src/config/relay-config.js';
import { MissionControlUnavailableError } from '#src/errors.js';
import { MissionControlIngest } from '#src/services/mission-control-ingest/mission-control-ingest.js';

const apiKey = 'dash_dev_secret-key-value';

const ingest = new MissionControlIngest({
  config: new RelayConfig({
    apiUrl: 'https://dash.example.com',
    apiKey,
    reporterName: 'seth-laptop',
  }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MissionControlIngest', () => {
  it('names a failed request by error name and code, never its message', async () => {
    const refused = Object.assign(
      new Error(`connect ECONNREFUSED Bearer ${apiKey}`),
      { code: 'ECONNREFUSED' },
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValue(new TypeError('fetch failed', { cause: refused })),
    );

    const error: unknown = await ingest.send([{}]).catch((caught) => caught);

    expect(error).toBeInstanceOf(MissionControlUnavailableError);
    expect(String(error)).toContain(
      'the request failed (TypeError, ECONNREFUSED)',
    );
    expect(String(error)).not.toContain(apiKey);
  });

  it('keeps a key quoted in the error message out of the detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValue(
          new TypeError(
            `Headers.append: "Bearer ${apiKey}" is an invalid header value.`,
          ),
        ),
    );

    const error: unknown = await ingest.send([{}]).catch((caught) => caught);

    expect(error).toBeInstanceOf(MissionControlUnavailableError);
    expect(String(error)).not.toContain(apiKey);
  });
});
