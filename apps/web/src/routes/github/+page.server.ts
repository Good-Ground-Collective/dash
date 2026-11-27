import { API_BASE_URL } from '$app/env/public';
import {
  type GithubFeedLoader,
  MissionControlGithubFeedLoader,
} from '#lib/server/github-feed-loader.ts';
import type { PageServerLoad } from './$types';

const feedLoader: GithubFeedLoader = new MissionControlGithubFeedLoader({
  apiBaseUrl: API_BASE_URL,
});

export const load: PageServerLoad = feedLoader.page;
