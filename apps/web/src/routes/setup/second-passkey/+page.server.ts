import { API_BASE_URL } from '$app/env/public';
import {
  type AuthPageLoader,
  MissionControlAuthPageLoader,
} from '#lib/server/auth-page-loader.ts';
import type { PageServerLoad } from './$types';

const authPageLoader: AuthPageLoader = new MissionControlAuthPageLoader({
  apiBaseUrl: API_BASE_URL,
});

export const load: PageServerLoad = authPageLoader.secondPasskey;
