import type { GithubGraphqlVariables } from '#src/contracts/github-activity-response.ts';

/** Repositories split into the groups one batched GraphQL request reads as aliases. */
export class GithubRepositoryBatches {
  static readonly SIZE = 10;

  static split(fullNames: readonly string[]): string[][] {
    return Array.from(
      { length: Math.ceil(fullNames.length / GithubRepositoryBatches.SIZE) },
      (_, batch) =>
        fullNames.slice(
          batch * GithubRepositoryBatches.SIZE,
          (batch + 1) * GithubRepositoryBatches.SIZE,
        ),
    );
  }

  /** The `owner0`, `name0`… variables the batch's aliases read. */
  static variables(fullNames: readonly string[]): GithubGraphqlVariables {
    return Object.fromEntries(
      fullNames.flatMap((fullName, index) => {
        const [owner = '', name = ''] = fullName.split('/');
        return [
          [`owner${index}`, owner],
          [`name${index}`, name],
        ];
      }),
    );
  }
}
