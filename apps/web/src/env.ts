import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

export const variables = defineEnvVars({
  API_BASE_URL: {
    public: true,
    schema: z.url().default('https://api.dash.doublel.studio'),
    description:
      'Base URL of Mission Control. The browser and server-side rendering both call it.',
  },
});
