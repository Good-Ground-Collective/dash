import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';

/** A placeholder message that shows how to add one, and gives tests and the code generators something real to work on. */
export const examplePing = new MessageDefinition({
  kind: 'example.ping',
  version: '1.0',
  payload: z.object({
    text: z
      .string()
      .min(1)
      .max(280)
      .describe('A short note the receiver echoes back.'),
  }),
});

export type ExamplePing = z.infer<typeof examplePing.schema>;
