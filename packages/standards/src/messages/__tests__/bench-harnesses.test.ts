import { MessageContract } from '#src/messages/__tests__/support/message-contract.js';
import { benchHarnesses } from '#src/messages/bench-harnesses.js';

await MessageContract.describe(benchHarnesses);
