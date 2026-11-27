import type { z } from 'zod';

import { envelopeSchema } from '#src/envelope/envelope-schema.js';
import {
  type MessageDefinitionProps,
  messageDefinitionPropsSchema,
} from '#src/envelope/message-definition-props.js';

/** One message kind at its current version, with the enveloped schema readers parse it with. */
export class MessageDefinition<
  const Kind extends string,
  Payload extends z.ZodObject,
> {
  readonly kind: Kind;
  readonly version: string;
  readonly schema: ReturnType<typeof envelopeSchema<Kind, Payload>>;

  constructor(props: MessageDefinitionProps<Kind, Payload>) {
    const { version } = messageDefinitionPropsSchema.parse(props);

    this.kind = props.kind;
    this.version = version;
    this.schema = envelopeSchema({
      kind: props.kind,
      major: version.slice(0, version.indexOf('.')),
      payload: props.payload,
    });
  }
}
