import { API_BASE_URL } from '$app/env/public';
import {
  MissionControlSettingsLoader,
  type SettingsLoader,
} from '#lib/server/settings-loader.ts';
import type { LayoutServerLoad } from './$types';

const settingsLoader: SettingsLoader = new MissionControlSettingsLoader({
  apiBaseUrl: API_BASE_URL,
});

export const load: LayoutServerLoad = settingsLoader.viewer;
