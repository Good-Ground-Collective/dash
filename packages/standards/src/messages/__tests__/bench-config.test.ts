import { MessageContract } from '#src/messages/__tests__/support/message-contract.js';
import { benchConfig } from '#src/messages/bench-config.js';

await MessageContract.describe(benchConfig);
