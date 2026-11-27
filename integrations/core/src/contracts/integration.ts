import type { Capability } from '#src/definitions/capabilities/capability.ts';

/** One configured connection to a provider, such as a GitHub org or a Jira site. */
export interface Integration {
  /** Unique among the registered integrations. */
  readonly id: string;
  readonly provider: string;
  /** The implementation of `capability`, or undefined when this integration doesn't offer it. */
  capability<T extends object>(capability: Capability<T>): T | undefined;
}
