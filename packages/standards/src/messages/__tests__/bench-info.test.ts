import { MessageContract } from '#src/messages/__tests__/support/message-contract.js';
import { benchInfo } from '#src/messages/bench-info.js';

await MessageContract.describe(benchInfo);
