import type {
  ActivityRelease,
  ActivityReleaseRead,
} from '@dash/integrations-core';

import { githubActivityQueries } from '#src/contracts/github-activity-queries.ts';
import { GithubActivityRecords } from '#src/contracts/github-activity-records.ts';
import { githubReleasesNodeSchema } from '#src/contracts/github-activity-response.ts';
import { GithubRepositoryBatches } from '#src/contracts/github-repository-batches.ts';
import type { GraphqlCall } from '#src/services/github-graphql/github-graphql.ts';

const toleratedReleaseErrors = new Set(['NOT_FOUND', 'FORBIDDEN']);

export interface ReadReleases {
  releases: ActivityRelease[];
  releaseReads: ActivityReleaseRead[];
}

/**
 * Recent releases, read apart from the default branches so that a repository whose releases
 * the installation may not read (a private one without Contents access, say) loses only its
 * releases. Such a repository is left out of the reads, so what is stored for it is kept.
 */
export class GithubActivityReleases {
  private readonly graphql: GraphqlCall;

  constructor(props: { graphql: GraphqlCall }) {
    this.graphql = props.graphql;
  }

  async read(props: {
    fullNames: readonly string[];
    since: string;
  }): Promise<ReadReleases> {
    const since = new Date(props.since).getTime();
    const releases: ActivityRelease[] = [];
    const releaseReads: ActivityReleaseRead[] = [];
    for (const batch of GithubRepositoryBatches.split(props.fullNames)) {
      const data = await this.graphql({
        query: githubActivityQueries.releases(batch.length),
        variables: GithubRepositoryBatches.variables(batch),
        tolerate: toleratedReleaseErrors,
      });
      for (const index of batch.keys()) {
        const node = githubReleasesNodeSchema.parse(
          data[`repository${index}`] ?? null,
        );
        if (node !== null) {
          const read = GithubActivityRecords.releases(node);
          releaseReads.push(read.releaseRead);
          releases.push(
            ...read.releases.filter(
              (release) => new Date(release.publishedAt).getTime() >= since,
            ),
          );
        }
      }
    }
    return { releases, releaseReads };
  }
}
