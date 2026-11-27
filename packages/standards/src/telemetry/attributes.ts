/** The OpenTelemetry semantic conventions release the `gen_ai.*` names below are checked against. */
export const genAiSemconvVersion = '1.45.0';

/** `gen_ai.*` attribute names from the pinned semantic conventions release. */
export const genAiAttributes = {
  providerName: 'gen_ai.provider.name',
  requestModel: 'gen_ai.request.model',
  responseModel: 'gen_ai.response.model',
  operationName: 'gen_ai.operation.name',
  conversationId: 'gen_ai.conversation.id',
  agentId: 'gen_ai.agent.id',
  agentName: 'gen_ai.agent.name',
  toolName: 'gen_ai.tool.name',
  usageInputTokens: 'gen_ai.usage.input_tokens',
  usageOutputTokens: 'gen_ai.usage.output_tokens',
  usageCacheReadInputTokens: 'gen_ai.usage.cache_read.input_tokens',
  usageCacheCreationInputTokens: 'gen_ai.usage.cache_creation.input_tokens',
} as const;

export type GenAiAttributeName =
  (typeof genAiAttributes)[keyof typeof genAiAttributes];

/** Dash's own attribute names, for data the semantic conventions don't cover. */
export const dashAttributes = {
  usageCostUsd: 'dash.usage.cost_usd',
} as const;

export type DashAttributeName =
  (typeof dashAttributes)[keyof typeof dashAttributes];
