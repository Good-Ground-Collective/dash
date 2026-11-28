import { API_BASE_URL } from '$app/env/public';
import {
  MissionControlSettingsLoader,
  type SettingsLoader,
} from '#lib/server/settings-loader.ts';
import {
  MissionControlWatchedChecksAction,
  type WatchedChecksAction,
} from '#lib/server/watched-checks/watched-checks-action.ts';
import type { Actions, PageServerLoad } from './$types';

const settingsLoader: SettingsLoader = new MissionControlSettingsLoader({
  apiBaseUrl: API_BASE_URL,
});

const watchedChecksAction: WatchedChecksAction =
  new MissionControlWatchedChecksAction({ apiBaseUrl: API_BASE_URL });

export const load: PageServerLoad = settingsLoader.watchedChecks;

export const actions = {
  addRule: watchedChecksAction.addRule,
  removeRule: watchedChecksAction.removeRule,
  saveRepository: watchedChecksAction.saveRepository,
} satisfies Actions;
