import type { FastifyRequest } from 'fastify';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import { SignedInPerson } from '#src/auth/services/signed-in-person/signed-in-person.ts';
import {
  objectivesQuerySchema,
  objectivesSchema,
  overlayChangesSchema,
  overlayParamsSchema,
  overlaySchema,
} from '#src/objectives/contracts/objectives.ts';
import { ObjectivesSignInRequiredError } from '#src/objectives/errors.ts';
import type { ObjectiveOverlayRepository } from '#src/objectives/repositories/objective-overlays/objective-overlay-repository.ts';
import type { ObjectiveRecordReader } from '#src/objectives/repositories/objective-records/objective-record-reader.ts';
import type { ObjectiveOverlays } from '#src/objectives/services/objective-overlays/objective-overlays.ts';
import { ObjectivesAssembly } from '#src/objectives/services/objectives-assembly/objectives-assembly.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

/**
 * `GET /objectives`, the signed-in person's initiatives and epics read from what the last
 * reconcile stored, and `PATCH /objectives/:id/overlay`, which sets what Dash keeps beside
 * the tracker.
 */
export class ObjectivesRoutes {
  private readonly reader: Pick<ObjectiveRecordReader, 'recordsFor'>;
  private readonly overlayRepository: Pick<
    ObjectiveOverlayRepository,
    'listFor'
  >;
  private readonly overlays: ObjectiveOverlays;
  private readonly person: SignedInPerson;

  constructor(props: {
    reader: Pick<ObjectiveRecordReader, 'recordsFor'>;
    overlayRepository: Pick<ObjectiveOverlayRepository, 'listFor'>;
    overlays: ObjectiveOverlays;
    identity: Pick<Identity, 'session'>;
  }) {
    this.reader = props.reader;
    this.overlayRepository = props.overlayRepository;
    this.overlays = props.overlays;
    this.person = new SignedInPerson({ identity: props.identity });
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      '/objectives',
      {
        schema: {
          querystring: objectivesQuerySchema,
          response: { 200: objectivesSchema },
        },
      },
      async (request) => {
        const userId = await this.signedIn(request);
        const [connections, overlays] = await Promise.all([
          this.reader.recordsFor({ connectedBy: userId }),
          this.overlayRepository.listFor({ userId }),
        ]);
        return ObjectivesAssembly.assemble({
          connections,
          overlays,
          statuses: request.query.status,
          now: new Date(),
        });
      },
    );

    app.patch(
      '/objectives/:id/overlay',
      {
        schema: {
          params: overlayParamsSchema,
          body: overlayChangesSchema,
          response: { 200: overlaySchema },
        },
      },
      async (request) =>
        this.overlays.edit({
          userId: await this.signedIn(request),
          id: request.params.id,
          changes: request.body,
        }),
    );
  }

  private async signedIn(request: FastifyRequest): Promise<string> {
    const userId = await this.person.of(request);
    if (userId === null) {
      throw new ObjectivesSignInRequiredError();
    }
    return userId;
  }
}
