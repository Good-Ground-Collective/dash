import { defineEnvVars } from '@sveltejs/kit/env';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';

/** Accepts an unset variable; `EnvironmentBuildStamp` decides what blank or malformed values show. */
const optionalValidator = (value: string | undefined): string | undefined =>
  value;

export const variables = defineEnvVars({
  API_BASE_URL: {
    public: true,
    schema: missionControlBaseUrlSchema.default(
      'https://api.dash.doublel.studio',
    ),
    description:
      'Base URL of Mission Control. The browser and server-side rendering both call it.',
  },
  APP_VERSION: {
    schema: optionalValidator,
    description:
      'The release tag the image was built for, such as v1.1.1. `bin/image` bakes it in; unset shows `dev`.',
  },
  APP_COMMIT: {
    schema: optionalValidator,
    description:
      'The full commit SHA the image was built from. `bin/image` bakes it in; unset hides the commit.',
  },
});
