import type { ProviderId } from '#src/contracts/external-record.ts';
import type { Capability } from '#src/definitions/capabilities/capability.ts';

/** One configured connection to a provider, such as a GitHub org or a Jira site. */
export interface Integration {
  /** Unique among the registered integrations. */
  readonly id: string;
  /** Must match `providerIdSchema`, the same id its records carry. */
  readonly provider: ProviderId;
  /** The implementation of `capability`, or undefined when this integration doesn't offer it. */
  capability<T extends object>(capability: Capability<T>): T | undefined;
}
