import { z } from 'zod';

export const watchModeSchema = z.enum(['watch', 'ignore']);

export const watchRuleSchema = z.object({
  id: z.string(),
  pattern: z.string(),
});

export const watchOverrideSchema = z.object({
  repository: z.string(),
  checkName: z.string(),
  mode: watchModeSchema,
});

/** `GET /integrations/github/watched-checks` on Mission Control, which every change to it answers with too. */
export const watchedChecksSchema = z.object({
  rules: z
    .array(watchRuleSchema)
    .describe('Rules for every repository, oldest first.'),
  overrides: z
    .array(watchOverrideSchema)
    .describe('Per-repository exceptions to the rules.'),
});

export type WatchMode = z.infer<typeof watchModeSchema>;
export type WatchRule = z.infer<typeof watchRuleSchema>;
export type WatchOverride = z.infer<typeof watchOverrideSchema>;
export type WatchedChecks = z.infer<typeof watchedChecksSchema>;
