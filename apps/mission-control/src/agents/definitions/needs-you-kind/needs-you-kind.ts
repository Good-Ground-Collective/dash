import { z } from 'zod';

export const needsYouKinds = ['needs_input', 'stopped_responding'] as const;

export const needsYouKindSchema = z
  .enum(needsYouKinds)
  .describe(
    '`needs_input` is an agent waiting on an answer. `stopped_responding` is a session the watchdog marked lost.',
  );

export type NeedsYouKind = z.infer<typeof needsYouKindSchema>;
