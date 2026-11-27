import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type {
  DispatchedDelivery,
  WebhookEventHandler,
} from '#src/connections/contracts/webhook-events.ts';
import { InMemoryWebhookEventRegistry } from '#src/connections/services/webhook-event-registry/webhook-event-registry.ts';

const namedHandlerPropsSchema = z.object({
  event: z.string().min(1),
  actions: z.array(z.string().min(1)).readonly().nullable(),
});

class NamedHandler implements WebhookEventHandler {
  readonly provider = 'github';
  readonly event: string;
  readonly actions: readonly string[] | null;
  readonly handled: DispatchedDelivery[] = [];

  constructor(props: z.input<typeof namedHandlerPropsSchema>) {
    const parsed = namedHandlerPropsSchema.parse(props);
    this.event = parsed.event;
    this.actions = parsed.actions;
  }

  async handle(delivery: DispatchedDelivery): Promise<void> {
    this.handled.push(delivery);
  }
}

const registry = new InMemoryWebhookEventRegistry();
const issues = new NamedHandler({ event: 'issues', actions: ['assigned'] });
const statuses = new NamedHandler({ event: 'status', actions: null });
const objectives = new NamedHandler({
  event: 'issues',
  actions: ['edited', 'assigned'],
});
registry.register(issues);
registry.register(statuses);
registry.register(objectives);

describe('InMemoryWebhookEventRegistry', () => {
  it('matches a handler by provider, event and listed action', () => {
    expect(
      registry.handlersFor({
        provider: 'github',
        event: 'issues',
        action: 'assigned',
      }),
    ).toEqual([issues, objectives]);
    expect(
      registry.handlersFor({
        provider: 'github',
        event: 'issues',
        action: 'edited',
      }),
    ).toEqual([objectives]);
  });

  it('matches every action, and none, for a handler that lists no actions', () => {
    expect(
      registry.handlersFor({
        provider: 'github',
        event: 'status',
        action: null,
      }),
    ).toEqual([statuses]);
  });

  it('ignores events, actions and providers nothing registered for', () => {
    expect(
      registry.handlersFor({
        provider: 'github',
        event: 'star',
        action: 'created',
      }),
    ).toEqual([]);
    expect(
      registry.handlersFor({
        provider: 'github',
        event: 'issues',
        action: 'labeled',
      }),
    ).toEqual([]);
    expect(
      registry.handlersFor({
        provider: 'github',
        event: 'issues',
        action: null,
      }),
    ).toEqual([]);
    expect(
      registry.handlersFor({
        provider: 'forge',
        event: 'status',
        action: null,
      }),
    ).toEqual([]);
  });
});
