import { APP_COMMIT, APP_VERSION } from '$app/env/private';
import { API_BASE_URL } from '$app/env/public';
import { EnvironmentBuildStamp } from '#lib/build/build-stamp.ts';
import {
  MissionControlShellLoader,
  type ShellLoader,
} from '#lib/server/shell-loader.ts';
import type { LayoutServerLoad } from './$types';

const shellLoader: ShellLoader = new MissionControlShellLoader({
  apiBaseUrl: API_BASE_URL,
  build: EnvironmentBuildStamp.from({
    version: APP_VERSION,
    commit: APP_COMMIT,
  }),
});

export const load: LayoutServerLoad = shellLoader.load;
