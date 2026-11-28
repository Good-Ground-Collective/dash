import { z } from 'zod';

const timestampSchema = z.iso.datetime({ offset: true }).pipe(z.coerce.date());

export const needsYouKindSchema = z
  .enum(['needs_input', 'stopped_responding'])
  .describe(
    '`needs_input` is an agent waiting on an answer. `stopped_responding` is a session the watchdog marked lost.',
  );

export const needsYouQuestionSchema = z
  .object({
    text: z.string(),
    options: z
      .array(
        z.object({ label: z.string(), description: z.string().optional() }),
      )
      .optional(),
  })
  .describe(
    'The question exactly as the agent sent it, so it is untrusted text to show as plain text.',
  );

/** Something waiting on a person. Published as `needs-you.opened` and, once resolved, `needs-you.resolved`. */
export const needsYouItemSchema = z.object({
  id: z.uuid(),
  reportedBy: z
    .uuid()
    .describe('The service account principal whose key reported the session.'),
  sessionId: z.string(),
  agentId: z
    .string()
    .nullable()
    .describe('The subagent that asked. `null` for the session itself.'),
  kind: needsYouKindSchema,
  question: needsYouQuestionSchema
    .nullable()
    .describe(
      '`null` when the agent reported needing input without asking anything.',
    ),
  openedAt: timestampSchema.describe('When Mission Control raised the item.'),
  resolvedAt: timestampSchema
    .nullable()
    .describe(
      'When a later heartbeat left needs input or the session ended. `null` while it is open.',
    ),
});

/** `GET /api/needs-you` on Mission Control. */
export const needsYouItemsSchema = z.object({
  items: z.array(needsYouItemSchema).describe('Open items, newest first.'),
});

export type NeedsYouQuestion = z.infer<typeof needsYouQuestionSchema>;
export type NeedsYouItem = z.infer<typeof needsYouItemSchema>;
