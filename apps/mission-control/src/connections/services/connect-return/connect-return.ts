import { providerIdSchema } from '@dash/integrations-core';
import { z } from 'zod';

import {
  type ConnectErrorReason,
  type ConnectOutcome,
  returnToSchema,
} from '#src/connections/contracts/connections.ts';

export const connectReturnPropsSchema = z.object({
  provider: providerIdSchema,
  webOrigin: z.url().describe('The web app the person is sent back to.'),
  defaultReturnTo: returnToSchema.describe(
    'Where the person goes when the flow lost track of where they started.',
  ),
});

export type ConnectReturnProps = z.input<typeof connectReturnPropsSchema>;

/** Where a provider's callbacks send the person back to in the web app, with what the trip did. */
export class ConnectReturn {
  private readonly provider: string;
  private readonly webOrigin: string;
  private readonly defaultReturnTo: string;

  constructor(props: ConnectReturnProps) {
    const valid = connectReturnPropsSchema.parse(props);
    this.provider = valid.provider;
    this.webOrigin = valid.webOrigin;
    this.defaultReturnTo = valid.defaultReturnTo;
  }

  /** `returnTo` with `connect=<outcome>`, `provider` and, on failure, `reason`. */
  url(props: {
    returnTo?: string;
    outcome: ConnectOutcome;
    reason?: ConnectErrorReason;
  }): string {
    const url = new URL(props.returnTo ?? this.defaultReturnTo, this.webOrigin);
    url.searchParams.set('connect', props.outcome);
    url.searchParams.set('provider', this.provider);
    if (props.reason !== undefined) {
      url.searchParams.set('reason', props.reason);
    }
    return url.toString();
  }
}
