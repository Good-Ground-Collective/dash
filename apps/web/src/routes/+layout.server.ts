import { API_BASE_URL } from '$app/env/public';
import { ShellLoader } from '#lib/server/shell-loader.ts';
import type { LayoutServerLoad } from './$types';

const shellLoader = new ShellLoader({ apiBaseUrl: API_BASE_URL });

export const load: LayoutServerLoad = shellLoader.load;
