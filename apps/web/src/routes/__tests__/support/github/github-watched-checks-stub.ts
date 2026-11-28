import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { StubBranch } from './github-feed-branches.ts';

interface StubJson {
  status: number;
  body: object;
}

interface Override {
  repository: string;
  checkName: string;
  mode: 'watch' | 'ignore';
}

const patternBodySchema = z.object({
  pattern: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^*]*\*?$/u),
});
const overrideBodySchema = z.object({
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/u),
  checkName: z.string().min(1),
  mode: z.enum(['watch', 'ignore']),
});

/**
 * Mission Control's `/integrations/github/watched-checks` routes for `GithubStub`, and the
 * watched state it gives the feed's default branches. It starts with one rule for every repo
 * and one exception, so the section has something to show.
 */
export class GithubWatchedChecksStub {
  private rules: { id: string; pattern: string }[] =
    GithubWatchedChecksStub.seedRules();
  private overrides: Override[] = GithubWatchedChecksStub.seedOverrides();

  reset(): void {
    this.rules = GithubWatchedChecksStub.seedRules();
    this.overrides = GithubWatchedChecksStub.seedOverrides();
  }

  /** Answers a request under `/watched-checks`, or `null` when the path isn't one. */
  serve(props: {
    method: string;
    page: string;
    query: URLSearchParams;
    body: string;
    signedIn: boolean;
  }): StubJson | null {
    if (!props.page.startsWith('/watched-checks')) {
      return null;
    }
    if (!props.signedIn) {
      return { status: 401, body: { code: 'SIGN_IN_REQUIRED' } };
    }
    const path = props.page.slice('/watched-checks'.length);
    if (props.method === 'GET' && path === '') {
      return this.chosen(200);
    }
    if (props.method === 'POST' && path === '/rules') {
      return this.addRule(props.body);
    }
    if (props.method === 'DELETE' && path.startsWith('/rules/')) {
      return this.removeRule(decodeURIComponent(path.slice('/rules/'.length)));
    }
    if (props.method === 'PUT' && path === '/overrides') {
      return this.setOverride(props.body);
    }
    if (props.method === 'DELETE' && path === '/overrides') {
      return this.clearOverride(props.query);
    }
    return { status: 404, body: { code: 'NOT_FOUND' } };
  }

  /** The branches with each check's `watched` and `watchSource`, and the branch's `watchedState`. */
  decorate(branches: readonly StubBranch[]) {
    return branches.map((branch) => {
      const checks = branch.checks.map((check) => {
        const watchSource = this.sourceOf({
          repository: branch.repository.fullName,
          checkName: check.name,
        });
        return { ...check, watched: watchSource !== null, watchSource };
      });
      return {
        ...branch,
        watchedState: GithubWatchedChecksStub.rollUp(checks),
        checks,
      };
    });
  }

  private sourceOf(props: {
    repository: string;
    checkName: string;
  }): 'rule' | 'repo' | null {
    const said = this.overrides.find(
      (override) =>
        override.repository === props.repository &&
        override.checkName === props.checkName,
    )?.mode;
    if (said === 'watch') {
      return 'repo';
    }
    if (said === 'ignore') {
      return null;
    }
    return this.rules.some(({ pattern }) =>
      pattern.endsWith('*')
        ? props.checkName.startsWith(pattern.slice(0, -1))
        : props.checkName === pattern,
    )
      ? 'rule'
      : null;
  }

  private addRule(body: string): StubJson {
    const parsed = patternBodySchema.safeParse(JSON.parse(body));
    if (!parsed.success) {
      return { status: 400, body: { code: 'FST_ERR_VALIDATION' } };
    }
    if (!this.rules.some(({ pattern }) => pattern === parsed.data.pattern)) {
      this.rules.push({ id: randomUUID(), pattern: parsed.data.pattern });
    }
    return this.chosen(201);
  }

  private removeRule(id: string): StubJson {
    if (!this.rules.some((rule) => rule.id === id)) {
      return { status: 404, body: { code: 'WATCH_RULE_NOT_FOUND' } };
    }
    this.rules = this.rules.filter((rule) => rule.id !== id);
    return this.chosen(200);
  }

  private setOverride(body: string): StubJson {
    const parsed = overrideBodySchema.safeParse(JSON.parse(body));
    if (!parsed.success) {
      return { status: 400, body: { code: 'FST_ERR_VALIDATION' } };
    }
    this.overrides = [
      ...this.overrides.filter(
        (override) =>
          override.repository !== parsed.data.repository ||
          override.checkName !== parsed.data.checkName,
      ),
      parsed.data,
    ];
    return this.chosen(200);
  }

  private clearOverride(query: URLSearchParams): StubJson {
    this.overrides = this.overrides.filter(
      (override) =>
        override.repository !== query.get('repository') ||
        override.checkName !== query.get('checkName'),
    );
    return this.chosen(200);
  }

  private chosen(status: number): StubJson {
    return {
      status,
      body: {
        rules: this.rules,
        overrides: this.overrides.toSorted(
          (left, right) =>
            left.repository.localeCompare(right.repository) ||
            left.checkName.localeCompare(right.checkName),
        ),
      },
    };
  }

  private static rollUp(
    checks: readonly { watched: boolean; state: string }[],
  ): 'failing' | 'pending' | 'passing' | 'none' {
    const watched = checks.filter((check) => check.watched);
    if (watched.length === 0) {
      return 'none';
    }
    if (watched.some(({ state }) => state === 'failure')) {
      return 'failing';
    }
    if (watched.some(({ state }) => state === 'pending')) {
      return 'pending';
    }
    return 'passing';
  }

  private static seedRules() {
    return [{ id: randomUUID(), pattern: 'Deploy*' }];
  }

  private static seedOverrides(): Override[] {
    return [
      {
        repository: 'acme-labs/web',
        checkName: 'codecov/patch',
        mode: 'watch',
      },
    ];
  }
}
