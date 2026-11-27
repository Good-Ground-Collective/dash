import { z } from 'zod';

export const messageDefinitionPropsSchema = z.object({
  kind: z
    .string()
    .regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/)
    .describe('A dotted message name, such as `example.ping`.'),
  version: z
    .string()
    .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
    .describe('The current `<major>.<minor>` version of this message kind.'),
});

export type MessageDefinitionProps<
  Kind extends string,
  Payload extends z.ZodObject,
> = z.input<typeof messageDefinitionPropsSchema> & {
  kind: Kind;
  payload: Payload;
};
