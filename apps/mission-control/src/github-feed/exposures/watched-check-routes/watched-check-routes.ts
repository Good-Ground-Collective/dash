import type { Identity } from '#src/auth/services/identity/identity.ts';
import { SignedInPerson } from '#src/auth/services/signed-in-person/signed-in-person.ts';
import {
  addWatchRuleBodySchema,
  watchedChecksSchema,
  watchOverrideKeySchema,
  watchOverrideSchema,
  watchRuleParamsSchema,
} from '#src/github-feed/contracts/watched-checks.ts';
import type { WatchedChecks } from '#src/github-feed/contracts/watched-checks.ts';
import {
  WatchedChecksSignInRequiredError,
  WatchRuleNotFoundError,
} from '#src/github-feed/errors.ts';
import type { WatchedChecksRepository } from '#src/github-feed/repositories/watched-checks/watched-checks-repository.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

const watchedChecksPath = '/integrations/github/watched-checks';

/**
 * The checks the signed-in person watches: rules for every repository and a repository's
 * own exceptions. Every answer is the person's whole choice afterwards, so a page can show
 * it without reading again.
 */
export class WatchedCheckRoutes {
  private readonly checks: WatchedChecksRepository;
  private readonly person: SignedInPerson;

  constructor(props: {
    checks: WatchedChecksRepository;
    identity: Pick<Identity, 'session'>;
  }) {
    this.checks = props.checks;
    this.person = new SignedInPerson({ identity: props.identity });
  }

  register(app: ZodFastifyInstance): void {
    const response = { 200: watchedChecksSchema };

    app.get(watchedChecksPath, { schema: { response } }, async (request) =>
      this.chosenBy(await this.signedIn(request)),
    );

    app.post(
      `${watchedChecksPath}/rules`,
      {
        schema: {
          body: addWatchRuleBodySchema,
          response: { 201: watchedChecksSchema },
        },
      },
      async (request, reply) => {
        const userId = await this.signedIn(request);
        await this.checks.addRule({ userId, pattern: request.body.pattern });
        return reply.code(201).send(await this.chosenBy(userId));
      },
    );

    app.delete(
      `${watchedChecksPath}/rules/:id`,
      { schema: { params: watchRuleParamsSchema, response } },
      async (request) => {
        const userId = await this.signedIn(request);
        const removed = await this.checks.removeRule({
          userId,
          id: request.params.id,
        });
        if (!removed) {
          throw new WatchRuleNotFoundError({ id: request.params.id });
        }
        return this.chosenBy(userId);
      },
    );

    app.put(
      `${watchedChecksPath}/overrides`,
      { schema: { body: watchOverrideSchema, response } },
      async (request) => {
        const userId = await this.signedIn(request);
        await this.checks.setOverride({ userId, ...request.body });
        return this.chosenBy(userId);
      },
    );

    app.delete(
      `${watchedChecksPath}/overrides`,
      { schema: { querystring: watchOverrideKeySchema, response } },
      async (request) => {
        const userId = await this.signedIn(request);
        await this.checks.clearOverride({ userId, ...request.query });
        return this.chosenBy(userId);
      },
    );
  }

  private async signedIn(
    request: Parameters<SignedInPerson['of']>[0],
  ): Promise<string> {
    const userId = await this.person.of(request);
    if (userId === null) {
      throw new WatchedChecksSignInRequiredError();
    }
    return userId;
  }

  private async chosenBy(userId: string): Promise<WatchedChecks> {
    const [rules, overrides] = await Promise.all([
      this.checks.rulesFor({ userId }),
      this.checks.overridesFor({ userId }),
    ]);
    return { rules, overrides };
  }
}
