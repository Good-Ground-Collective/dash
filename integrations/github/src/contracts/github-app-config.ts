import { createPrivateKey } from 'node:crypto';

import { z } from 'zod';

/** Kamal's env file turns a key's newlines into literal `\n`, so the transform puts them back. */
const pemSchema = z
  .string()
  .min(1)
  .transform((value) =>
    value.includes('\n') ? value : value.replaceAll(String.raw`\n`, '\n'),
  )
  .refine(
    (value) => {
      try {
        createPrivateKey(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Expected the App private key as a PEM' },
  );

/** The registered GitHub App's settings and credentials. */
export const githubAppConfigSchema = z.object({
  appId: z.string().regex(/^\d+$/u, 'Expected the numeric App ID'),
  slug: z
    .string()
    .regex(/^[a-z\d][a-z\d-]*$/u)
    .describe('From the App URL, https://github.com/apps/<slug>.'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  privateKey: pemSchema,
  webhookSecret: z.string().min(1),
});

export type GithubAppConfig = z.input<typeof githubAppConfigSchema>;
