import { MessageContract } from '#src/messages/__tests__/support/message-contract.js';
import { benchMetrics } from '#src/messages/bench-metrics.js';

await MessageContract.describe(benchMetrics);
