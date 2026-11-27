import type { request } from '@octokit/request';

/** `@octokit/request`, or one made with `request.defaults`, such as a stubbed `fetch` in tests. */
export type GithubRequest = typeof request;
