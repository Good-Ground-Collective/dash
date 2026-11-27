import { z } from 'zod';

const textSchema = z.string().optional().catch(undefined);

const askedQuestionSchema = z.looseObject({
  question: z.string(),
  options: z
    .array(
      z.looseObject({
        label: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * The JSON a Claude Code hook receives on stdin, across every event dash-hooks handles. Fields
 * that only some events carry are optional, unknown fields are ignored, and a malformed optional
 * field is dropped rather than failing the heartbeat.
 */
export const hookInputSchema = z
  .looseObject({
    session_id: z.string().min(1),
    transcript_path: textSchema,
    cwd: textSchema,
    agent_id: textSchema,
    agent_type: textSchema,
    source: textSchema,
    model: textSchema,
    tool_name: textSchema,
    tool_use_id: textSchema,
    tool_input: z
      .looseObject({
        questions: z.array(askedQuestionSchema).optional().catch(undefined),
      })
      .optional()
      .catch(undefined),
    message: textSchema,
    notification_type: textSchema,
    last_assistant_message: textSchema,
    agent_transcript_path: textSchema,
    error: textSchema,
    error_details: textSchema,
  })
  .transform((input) => ({
    sessionId: input.session_id,
    transcriptPath: input.transcript_path,
    cwd: input.cwd,
    agentId: input.agent_id,
    agentType: input.agent_type,
    source: input.source,
    model: input.model,
    toolName: input.tool_name,
    toolUseId: input.tool_use_id,
    questions: input.tool_input?.questions,
    message: input.message,
    notificationType: input.notification_type,
    lastAssistantMessage: input.last_assistant_message,
    agentTranscriptPath: input.agent_transcript_path,
    error: input.error,
    errorDetails: input.error_details,
  }));

export type HookInput = z.output<typeof hookInputSchema>;
