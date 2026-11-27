import { z } from 'zod';

import { dashAttributes, genAiAttributes } from '#src/telemetry/attributes.js';

const tokenCount = z.number().int().nonnegative();

/** A flat set of telemetry attributes that messages embed. Every attribute is optional; senders report what they know. */
export const telemetryAttributesSchema = z
  .object({
    [genAiAttributes.providerName]: z
      .string()
      .min(1)
      .optional()
      .describe('The model provider, such as `anthropic` or `openai`.'),
    [genAiAttributes.requestModel]: z.string().min(1).optional(),
    [genAiAttributes.responseModel]: z.string().min(1).optional(),
    [genAiAttributes.operationName]: z
      .string()
      .min(1)
      .optional()
      .describe(
        'The operation, such as `chat`, `invoke_agent` or `execute_tool`.',
      ),
    [genAiAttributes.conversationId]: z.string().min(1).optional(),
    [genAiAttributes.agentId]: z.string().min(1).optional(),
    [genAiAttributes.agentName]: z.string().min(1).optional(),
    [genAiAttributes.toolName]: z.string().min(1).optional(),
    [genAiAttributes.usageInputTokens]: tokenCount.optional(),
    [genAiAttributes.usageOutputTokens]: tokenCount.optional(),
    [genAiAttributes.usageCacheReadInputTokens]: tokenCount.optional(),
    [genAiAttributes.usageCacheCreationInputTokens]: tokenCount.optional(),
    [dashAttributes.usageCostUsd]: z
      .number()
      .nonnegative()
      .optional()
      .describe('What the usage cost, in US dollars.'),
  })
  .describe(
    'Telemetry attributes named after the OpenTelemetry GenAI semantic conventions, plus `dash.*` for fields of our own.',
  );

export type TelemetryAttributes = z.infer<typeof telemetryAttributesSchema>;
