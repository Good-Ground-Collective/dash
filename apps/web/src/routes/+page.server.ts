import { API_BASE_URL } from '$app/env/public';
import {
  type HomeLoader,
  MissionControlHomeLoader,
} from '#lib/server/home-loader.ts';
import type { PageServerLoad } from './$types';

const homeLoader: HomeLoader = new MissionControlHomeLoader({
  apiBaseUrl: API_BASE_URL,
});

export const load: PageServerLoad = homeLoader.load;
