import { z } from 'zod';

import { needsYouItemsSchema } from '#src/agents/contracts/needs-you-item.ts';
import { NeedsYouSignInRequiredError } from '#src/agents/errors.ts';
import type { NeedsYouItemRepository } from '#src/agents/repositories/needs-you-items/needs-you-item-repository.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';
import { SignedInPerson } from '#src/auth/services/signed-in-person/signed-in-person.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

const needsYouRoutesPropsSchema = z.object({
  items: z.custom<NeedsYouItemRepository>(),
  identity: z.custom<Pick<Identity, 'session'>>(),
});

/** `GET /api/needs-you`, for a signed-in person: the open items, newest first. */
export class NeedsYouRoutes {
  private readonly items: NeedsYouItemRepository;
  private readonly person: SignedInPerson;

  constructor(props: z.input<typeof needsYouRoutesPropsSchema>) {
    const parsed = needsYouRoutesPropsSchema.parse(props);
    this.items = parsed.items;
    this.person = new SignedInPerson({ identity: parsed.identity });
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      '/api/needs-you',
      { schema: { response: { 200: needsYouItemsSchema } } },
      async (request) => {
        if ((await this.person.of(request)) === null) {
          throw new NeedsYouSignInRequiredError();
        }
        return { items: await this.items.listOpen() };
      },
    );
  }
}
