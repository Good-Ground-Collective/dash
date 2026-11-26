import { defineEnvVars } from '@sveltejs/kit/env';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';

export const variables = defineEnvVars({
  API_BASE_URL: {
    public: true,
    schema: missionControlBaseUrlSchema.default(
      'https://api.dash.doublel.studio',
    ),
    description:
      'Base URL of Mission Control. The browser and server-side rendering both call it.',
  },
});
