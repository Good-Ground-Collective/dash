import { examplePing } from '#src/messages/example.js';

/** Every message kind with its current schema and version. The JSON Schema generator walks this list. */
export const messageRegistry = [examplePing] as const;

export type RegisteredMessage = (typeof messageRegistry)[number];
