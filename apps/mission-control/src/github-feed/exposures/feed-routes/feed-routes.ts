import type { Identity } from '#src/auth/services/identity/identity.ts';
import { SignedInPerson } from '#src/auth/services/signed-in-person/signed-in-person.ts';
import { githubFeedSchema } from '#src/github-feed/contracts/github-feed.ts';
import { FeedSignInRequiredError } from '#src/github-feed/errors.ts';
import type { GithubRecordReader } from '#src/github-feed/repositories/github-records/github-record-reader.ts';
import type { WatchedChecksRepository } from '#src/github-feed/repositories/watched-checks/watched-checks-repository.ts';
import { GithubFeedAssembly } from '#src/github-feed/services/github-feed-assembly/github-feed-assembly.ts';
import { WatchedCheckPolicy } from '#src/github-feed/services/watched-checks/watched-check-policy.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

/** `GET /integrations/github/feed`: the signed-in person's GitHub work, read from what the last reconcile stored, with their watched checks applied. */
export class FeedRoutes {
  private readonly reader: GithubRecordReader;
  private readonly checks: WatchedChecksRepository;
  private readonly person: SignedInPerson;

  constructor(props: {
    reader: GithubRecordReader;
    checks: WatchedChecksRepository;
    identity: Pick<Identity, 'session'>;
  }) {
    this.reader = props.reader;
    this.checks = props.checks;
    this.person = new SignedInPerson({ identity: props.identity });
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      '/integrations/github/feed',
      { schema: { response: { 200: githubFeedSchema } } },
      async (request) => {
        const userId = await this.person.of(request);
        if (userId === null) {
          throw new FeedSignInRequiredError();
        }
        const [records, rules, overrides] = await Promise.all([
          this.reader.recordsFor({ connectedBy: userId }),
          this.checks.rulesFor({ userId }),
          this.checks.overridesFor({ userId }),
        ]);
        return GithubFeedAssembly.assemble(
          records,
          new WatchedCheckPolicy({
            rules: rules.map(({ pattern }) => pattern),
            overrides,
          }),
        );
      },
    );
  }
}
