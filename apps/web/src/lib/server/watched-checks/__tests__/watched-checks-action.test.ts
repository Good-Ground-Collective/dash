import { isActionFailure } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchedChecks } from '#lib/api/watched-checks/watched-checks-contracts.ts';
import {
  MissionControlWatchedChecksAction,
  type WatchedChecksActionEvent,
} from '#lib/server/watched-checks/watched-checks-action.ts';
import { WatchedChecksForms } from '#lib/watched-checks/watched-checks-forms.ts';

/** One form post, with Mission Control answering each call with the current choices. */
class Post {
  readonly sent: { url: string; method: string }[] = [];
  private readonly fields: Record<string, string>;
  private readonly chosen: WatchedChecks;
  private readonly status: number;
  private readonly code: string;

  constructor(props: {
    fields: Record<string, string>;
    chosen?: WatchedChecks;
    status?: number;
    code?: string;
  }) {
    this.fields = props.fields;
    this.chosen = props.chosen ?? { rules: [], overrides: [] };
    this.status = props.status ?? 200;
    this.code = props.code ?? 'UNAVAILABLE';
  }

  get event(): WatchedChecksActionEvent {
    const form = new FormData();
    for (const [name, value] of Object.entries(this.fields)) {
      form.set(name, value);
    }
    return {
      request: new Request('http://localhost/?/action', {
        method: 'POST',
        body: form,
      }),
      fetch: async (input, init) => {
        const url = new URL(String(input));
        this.sent.push({
          url: `${url.pathname}${url.search}`,
          method: init?.method ?? 'GET',
        });
        return this.status === 200
          ? Response.json(this.chosen)
          : Response.json({ code: this.code }, { status: this.status });
      },
    };
  }
}

const action = new MissionControlWatchedChecksAction({
  apiBaseUrl: 'https://api.example.test',
});
const base = '/integrations/github/watched-checks';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MissionControlWatchedChecksAction rules', () => {
  it('adds a rule through Mission Control', async () => {
    const post = new Post({ fields: { pattern: 'Deploy*' } });

    await expect(action.addRule(post.event)).resolves.toEqual({
      watched: { form: 'addRule', message: null },
    });
    expect(post.sent).toEqual([{ url: `${base}/rules`, method: 'POST' }]);
  });

  it('refuses a pattern Mission Control would, without calling it', async () => {
    const post = new Post({ fields: { pattern: 'a*b' } });

    const result = await action.addRule(post.event);

    expect(isActionFailure(result)).toBe(true);
    expect(result).toMatchObject({
      status: 400,
      data: { watched: { form: 'addRule' } },
    });
    expect(post.sent).toEqual([]);
  });

  it('removes a rule, and says so when it is already gone', async () => {
    const removed = new Post({ fields: { id: 'r1' } });
    const gone = new Post({
      fields: { id: 'r1' },
      status: 404,
      code: 'WATCH_RULE_NOT_FOUND',
    });

    await expect(action.removeRule(removed.event)).resolves.toEqual({
      watched: { form: 'removeRule', message: null },
    });
    const result = await action.removeRule(gone.event);

    expect(removed.sent).toEqual([
      { url: `${base}/rules/r1`, method: 'DELETE' },
    ]);
    expect(result).toMatchObject({
      status: 404,
      data: { watched: { message: expect.stringContaining('already gone') } },
    });
  });

  it('says to try again when Mission Control is down', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const post = new Post({
      fields: { pattern: 'build' },
      status: 503,
    });

    await expect(action.addRule(post.event)).resolves.toMatchObject({
      status: 503,
      data: {
        watched: { message: 'Mission Control didn’t save that. Try again.' },
      },
    });
  });
});

describe('MissionControlWatchedChecksAction saveRepository', () => {
  const chosen: WatchedChecks = {
    rules: [],
    overrides: [
      { repository: 'acme/web', checkName: 'build', mode: 'ignore' },
      { repository: 'acme/web', checkName: 'lint', mode: 'watch' },
    ],
  };

  it('sends only what changed: sets the new answers and clears the ones back on the rules', async () => {
    const post = new Post({
      chosen,
      fields: {
        repository: 'acme/web',
        [WatchedChecksForms.choiceField('build')]: 'rules',
        [WatchedChecksForms.choiceField('lint')]: 'watch',
        [WatchedChecksForms.choiceField('Deploy to Staging')]: 'watch',
      },
    });

    await expect(action.saveRepository(post.event)).resolves.toEqual({
      watched: { form: 'saveRepository', message: null },
    });
    expect(post.sent).toEqual([
      { url: base, method: 'GET' },
      { url: `${base}/overrides`, method: 'PUT' },
      {
        url: `${base}/overrides?repository=acme%2Fweb&checkName=build`,
        method: 'DELETE',
      },
    ]);
  });

  it('calls nothing but the read when no answer changed', async () => {
    const post = new Post({
      chosen,
      fields: {
        repository: 'acme/web',
        [WatchedChecksForms.choiceField('build')]: 'ignore',
      },
    });

    await action.saveRepository(post.event);

    expect(post.sent).toEqual([{ url: base, method: 'GET' }]);
  });

  it('refuses a form that names no repository', async () => {
    const post = new Post({ fields: {} });

    const result = await action.saveRepository(post.event);

    expect(result).toMatchObject({ status: 400 });
    expect(post.sent).toEqual([]);
  });
});
