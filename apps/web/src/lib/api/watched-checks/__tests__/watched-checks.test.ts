import { describe, expect, it } from 'vitest';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import { HttpWatchedChecks } from '#lib/api/watched-checks/watched-checks.ts';

const chosen = {
  rules: [{ id: 'r1', pattern: 'Deploy*' }],
  overrides: [{ repository: 'acme/web', checkName: 'lint', mode: 'watch' }],
};

class RecordingFetch {
  readonly calls: { url: string; init: RequestInit | undefined }[] = [];

  readonly fetch: typeof fetch = async (input, init) => {
    this.calls.push({ url: String(input), init });
    return Response.json(chosen);
  };

  static client(recording: RecordingFetch): HttpWatchedChecks {
    return new HttpWatchedChecks({
      baseUrl: 'https://api.example.test/mc',
      fetch: recording.fetch,
    });
  }
}

describe('HttpWatchedChecks', () => {
  it('reads the person’s choices with credentials', async () => {
    const recording = new RecordingFetch();

    const read = await RecordingFetch.client(recording).read();

    expect(read).toEqual(chosen);
    expect(recording.calls[0]?.url).toBe(
      'https://api.example.test/mc/integrations/github/watched-checks',
    );
    expect(recording.calls[0]?.init).toMatchObject({
      method: 'GET',
      credentials: 'include',
    });
  });

  it('adds and removes rules', async () => {
    const recording = new RecordingFetch();
    const client = RecordingFetch.client(recording);

    await client.addRule({ pattern: 'Deploy*' });
    await client.removeRule({ id: 'r 1' });

    expect(recording.calls.map(({ url }) => url)).toEqual([
      'https://api.example.test/mc/integrations/github/watched-checks/rules',
      'https://api.example.test/mc/integrations/github/watched-checks/rules/r%201',
    ]);
    expect(recording.calls[0]?.init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ pattern: 'Deploy*' }),
    });
    expect(recording.calls[1]?.init).toMatchObject({ method: 'DELETE' });
  });
});

describe('HttpWatchedChecks exceptions', () => {
  it('sets and clears a repository’s exception', async () => {
    const recording = new RecordingFetch();
    const client = RecordingFetch.client(recording);

    await client.setOverride({
      repository: 'acme/web',
      checkName: 'Deploy to Staging',
      mode: 'ignore',
    });
    await client.clearOverride({
      repository: 'acme/web',
      checkName: 'Deploy to Staging',
    });

    expect(recording.calls[0]?.init).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({
        repository: 'acme/web',
        checkName: 'Deploy to Staging',
        mode: 'ignore',
      }),
    });
    expect(recording.calls[1]?.url).toBe(
      'https://api.example.test/mc/integrations/github/watched-checks/overrides?repository=acme%2Fweb&checkName=Deploy+to+Staging',
    );
    expect(recording.calls[1]?.init).toMatchObject({ method: 'DELETE' });
  });
});

describe('HttpWatchedChecks refusals', () => {
  it('rejects with Mission Control’s code when it refuses', async () => {
    const client = new HttpWatchedChecks({
      baseUrl: 'https://api.example.test',
      fetch: async () =>
        Response.json({ code: 'SIGN_IN_REQUIRED' }, { status: 401 }),
    });

    await expect(client.read()).rejects.toBeInstanceOf(MissionControlError);
    await expect(client.read()).rejects.toMatchObject({
      code: 'SIGN_IN_REQUIRED',
    });
  });
});
