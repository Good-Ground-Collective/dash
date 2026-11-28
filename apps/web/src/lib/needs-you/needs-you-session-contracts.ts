import { z } from 'zod';

/** The part of a session in `GET /api/agents/sessions` that says where an item's agent is running. */
export const needsYouSessionSchema = z.object({
  reportedBy: z
    .uuid()
    .describe(
      'The service account principal whose key reported it. Two keys sending the same `sessionId` are two sessions.',
    ),
  sessionId: z.string(),
  reporterName: z.string().describe('The name the hooks report as.'),
  benchId: z.string().nullable(),
  harness: z.string(),
  parent: z
    .object({
      machine: z
        .string()
        .nullable()
        .describe('The latest machine the session reported.'),
    })
    .nullable()
    .describe(
      'The session’s own state. `null` while only its subagents have reported.',
    ),
});

export const needsYouSessionsSchema = z.object({
  sessions: z
    .array(needsYouSessionSchema)
    .describe('Sessions where anything reported in the last 24 hours.'),
});

export type NeedsYouSession = z.infer<typeof needsYouSessionSchema>;
