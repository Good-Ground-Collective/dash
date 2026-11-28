import { describe, expect, it } from 'vitest';

import { githubActivityQueries } from '#src/contracts/github-activity-queries.ts';

describe('githubActivityQueries check contexts', () => {
  it('names the checks of authored pull requests only, so review requests and merges keep a flat cost', () => {
    const { search } = githubActivityQueries;
    const authoredStart = search.indexOf('authored: search');
    const assignedStart = search.indexOf('assigned: search');

    expect(search.match(/contexts\(first: 100\)/gu)).toHaveLength(1);
    expect(search.slice(authoredStart, assignedStart)).toContain(
      'contexts(first: 100)',
    );
    expect(search.match(/contexts\(first: 1\)/gu)).toHaveLength(2);
  });

  it('reads the rollup state and every check of each default branch head', () => {
    const query = githubActivityQueries.defaultBranches(1);

    expect(query).toContain('statusCheckRollup');
    expect(query).toContain('contexts(first: 100)');
    expect(query).toContain('... on StatusContext');
    expect(query).toContain(
      'checkSuite { app { slug } workflowRun { databaseId } }',
    );
  });
});
