import type { Identity } from '#src/auth/services/identity/identity.ts';
import { SignedInPerson } from '#src/connections/services/signed-in-person/signed-in-person.ts';
import { setupChecklistSchema } from '#src/onboarding/contracts/setup-checklist.ts';
import { SignInRequiredError } from '#src/onboarding/errors.ts';
import type { SetupChecklist } from '#src/onboarding/services/setup-checklist/setup-checklist.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

/** `GET /onboarding/checklist`: the signed-in person's setup checklist, for home. */
export class ChecklistRoutes {
  private readonly checklist: SetupChecklist;
  private readonly person: SignedInPerson;

  constructor(props: {
    checklist: SetupChecklist;
    identity: Pick<Identity, 'session'>;
  }) {
    this.checklist = props.checklist;
    this.person = new SignedInPerson({ identity: props.identity });
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      '/onboarding/checklist',
      { schema: { response: { 200: setupChecklistSchema } } },
      async (request) => {
        const userId = await this.person.of(request);
        if (userId === null) {
          throw new SignInRequiredError();
        }
        return this.checklist.for({ userId });
      },
    );
  }
}
