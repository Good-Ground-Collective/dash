import { installationChangeSchema } from '@dash/integrations-core';
import { z } from 'zod';

/** What a stored delivery's processing works from. The payload stays in storage. */
export const dispatchedDeliverySchema = z.object({
  provider: z.string().min(1),
  deliveryId: z.string().min(1),
  event: z.string().min(1),
  action: z.string().min(1).nullable(),
  installationId: z.string().min(1).nullable(),
  installationChange: installationChangeSchema.nullable(),
});

export type DispatchedDelivery = z.infer<typeof dispatchedDeliverySchema>;

/** A provider outage of a few seconds is retried inside a delivery's workflow: after 1, 2 and 4 seconds. */
export const webhookStepRetries = {
  retriesAllowed: true,
  maxAttempts: 4,
  intervalSeconds: 1,
  backoffRate: 2,
};

/**
 * What a module does when a provider's webhook reports an event. `handle` runs inside the
 * delivery's DBOS workflow after the connection itself is brought up to date, so it reads
 * and writes through DBOS steps and may start other workflows.
 */
export interface WebhookEventHandler {
  readonly provider: string;
  readonly event: string;
  /** The actions it handles, or null for every action, as for events that have none. */
  readonly actions: readonly string[] | null;
  handle(delivery: DispatchedDelivery): Promise<void>;
}
