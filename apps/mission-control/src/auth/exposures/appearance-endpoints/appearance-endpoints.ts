import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { z } from 'zod';

import {
  appearanceSchema,
  colorModeSchema,
  themeNameSchema,
} from '#src/auth/contracts/appearance.ts';
import { principalKindSchema } from '#src/auth/contracts/principal.ts';
import { ServicePrincipalForbiddenError } from '#src/auth/errors.ts';

const personSessionSchema = z.object({
  user: z.object({ id: z.uuid(), kind: principalKindSchema }),
});

/**
 * A person's saved theme and colour mode, kept on Better Auth's `user` so the session lookup
 * returns them with the viewer. `colorMode` stays unset until they choose one, and the web app
 * then follows the browser. `POST /api/auth/appearance/update` saves both.
 */
export class AppearanceEndpoints {
  readonly plugin: BetterAuthPlugin = {
    id: 'appearance',
    schema: {
      user: {
        fields: {
          theme: {
            type: [...themeNameSchema.options],
            required: true,
            defaultValue: themeNameSchema.enum.characters,
            input: false,
          },
          colorMode: {
            type: [...colorModeSchema.options],
            required: false,
            input: false,
          },
        },
      },
    },
    endpoints: {
      updateAppearance: createAuthEndpoint(
        '/appearance/update',
        { method: 'POST', body: appearanceSchema, use: [sessionMiddleware] },
        async (context) => {
          const { user } = personSessionSchema.parse(context.context.session);
          if (user.kind !== principalKindSchema.enum.user) {
            throw new ServicePrincipalForbiddenError({
              action: 'save an appearance',
            });
          }
          await context.context.internalAdapter.updateUser(user.id, {
            theme: context.body.theme,
            colorMode: context.body.mode,
          });
          return context.json(context.body);
        },
      ),
    },
  };
}
