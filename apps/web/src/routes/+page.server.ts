import { API_BASE_URL } from '$app/env/public';
import {
  type HomeLoader,
  MissionControlHomeLoader,
} from '#lib/server/home-loader.ts';
import {
  MissionControlObjectiveOverlayAction,
  type ObjectiveOverlayAction,
} from '#lib/server/objective-overlay-action.ts';
import type { Actions, PageServerLoad } from './$types';

const homeLoader: HomeLoader = new MissionControlHomeLoader({
  apiBaseUrl: API_BASE_URL,
});

const overlayAction: ObjectiveOverlayAction =
  new MissionControlObjectiveOverlayAction({ apiBaseUrl: API_BASE_URL });

export const load: PageServerLoad = homeLoader.load;

export const actions = { overlay: overlayAction.edit } satisfies Actions;
