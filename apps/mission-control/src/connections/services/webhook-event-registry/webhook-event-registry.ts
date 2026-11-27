import type {
  DispatchedDelivery,
  WebhookEventHandler,
} from '#src/connections/contracts/webhook-events.ts';

type EventKey = Pick<DispatchedDelivery, 'provider' | 'event' | 'action'>;

/**
 * The webhook events Dash acts on. Each module registers handlers for the events it cares
 * about before workflows launch; a delivery no handler matches is stored and nothing more.
 */
export interface WebhookEventRegistry {
  register(handler: WebhookEventHandler): void;
  handlersFor(delivery: EventKey): WebhookEventHandler[];
}

export class InMemoryWebhookEventRegistry implements WebhookEventRegistry {
  private readonly handlers: WebhookEventHandler[] = [];

  register(handler: WebhookEventHandler): void {
    this.handlers.push(handler);
  }

  handlersFor(delivery: EventKey): WebhookEventHandler[] {
    return this.handlers.filter(
      (handler) =>
        handler.provider === delivery.provider &&
        handler.event === delivery.event &&
        (handler.actions === null ||
          (delivery.action !== null &&
            handler.actions.includes(delivery.action))),
    );
  }
}
