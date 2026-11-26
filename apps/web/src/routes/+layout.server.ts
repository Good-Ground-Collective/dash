import { API_BASE_URL } from '$app/env/public';
import {
  MissionControlShellLoader,
  type ShellLoader,
} from '#lib/server/shell-loader.ts';
import type { LayoutServerLoad } from './$types';

const shellLoader: ShellLoader = new MissionControlShellLoader({
  apiBaseUrl: API_BASE_URL,
});

export const load: LayoutServerLoad = shellLoader.load;
