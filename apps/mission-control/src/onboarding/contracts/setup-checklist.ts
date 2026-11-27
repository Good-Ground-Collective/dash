import { z } from 'zod';

export const setupChecklistItemIdSchema = z.enum(['connectGitHub']);

export const setupChecklistItemSchema = z.object({
  id: setupChecklistItemIdSchema,
  done: z.boolean(),
});

/** `GET /onboarding/checklist`: what's left to set up, in the order home lists it. */
export const setupChecklistSchema = z.object({
  items: z.array(setupChecklistItemSchema),
});

export type SetupChecklistItemId = z.infer<typeof setupChecklistItemIdSchema>;
export type SetupChecklistItem = z.infer<typeof setupChecklistItemSchema>;
export type SetupChecklistReport = z.infer<typeof setupChecklistSchema>;
