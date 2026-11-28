import { z } from 'zod';

import { agentHeartbeatQuestionSchema } from '#src/agents/contracts/agent-heartbeat.ts';
import { needsYouKindSchema } from '#src/agents/definitions/needs-you-kind/needs-you-kind.ts';

const timestampSchema = z.iso.datetime({ offset: true });

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
  question: agentHeartbeatQuestionSchema
    .nullable()
    .describe(
      'The question exactly as the agent sent it. `null` when it reported needing input without one.',
    ),
  openedAt: timestampSchema.describe('When Mission Control raised the item.'),
  resolvedAt: timestampSchema
    .nullable()
    .describe(
      'When a later heartbeat left needs input or the session ended, or a heartbeat showed a lost session responding again. `null` while it is open.',
    ),
});

export type NeedsYouItem = z.infer<typeof needsYouItemSchema>;

export const needsYouItemsSchema = z.object({
  items: z.array(needsYouItemSchema).describe('Open items, newest first.'),
});
