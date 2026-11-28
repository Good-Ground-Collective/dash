import { z } from 'zod';

export const watchModeSchema = z.enum(['watch', 'ignore']);

export const watchSourceSchema = z.enum(['rule', 'repo']);

export const watchedStateSchema = z.enum([
  'failing',
  'pending',
  'passing',
  'none',
]);

export const watchPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^*]*\*?$/u, 'Use a check name, or a prefix ending in one *')
  .describe(
    'A check name to match exactly, or a prefix ending in `*`. A lone `*` matches every check.',
  );

const repositoryFullNameSchema = z
  .string()
  .regex(/^[^/\s]+\/[^/\s]+$/u, 'Use the repository as owner/name');

export const watchRuleSchema = z.object({
  id: z.uuid(),
  pattern: watchPatternSchema,
});

export const watchOverrideSchema = z.object({
  repository: repositoryFullNameSchema,
  checkName: z.string().min(1).max(500),
  mode: watchModeSchema,
});

export const watchOverrideKeySchema = watchOverrideSchema.omit({ mode: true });

/** `GET /integrations/github/watched-checks`: the signed-in person's rules for every repository and their per-repository exceptions. */
export const watchedChecksSchema = z.object({
  rules: z.array(watchRuleSchema).describe('Oldest first.'),
  overrides: z
    .array(watchOverrideSchema)
    .describe('By repository, then check name.'),
});

export const addWatchRuleBodySchema = z.object({ pattern: watchPatternSchema });

export const watchRuleParamsSchema = z.object({ id: z.uuid() });

export type WatchMode = z.infer<typeof watchModeSchema>;
export type WatchSource = z.infer<typeof watchSourceSchema>;
export type WatchedState = z.infer<typeof watchedStateSchema>;
export type WatchRule = z.infer<typeof watchRuleSchema>;
export type WatchOverride = z.infer<typeof watchOverrideSchema>;
export type WatchOverrideKey = z.infer<typeof watchOverrideKeySchema>;
export type WatchedChecks = z.infer<typeof watchedChecksSchema>;
