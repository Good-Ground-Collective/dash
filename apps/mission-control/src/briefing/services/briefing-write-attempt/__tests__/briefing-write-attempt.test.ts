import OpenAI from 'openai';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest';

import {
  BriefingWorkflowsFixture,
  settle,
} from '#src/briefing/__tests__/support/briefing-workflows-fixture.ts';
import { BriefingWriteFailedError } from '#src/briefing/errors.ts';
import { BriefingWriteAttempt } from '#src/briefing/services/briefing-write-attempt/briefing-write-attempt.ts';
import type { BriefingWriter } from '#src/briefing/services/briefing-writer/briefing-writer.ts';
import { SampleSnapshot } from '#src/briefing/__tests__/support/sample-snapshot.ts';
import { adaId } from '#src/objectives/__tests__/support/objectives-fixtures.ts';

const databaseUrl = inject('databaseUrl');
const fixture = new BriefingWorkflowsFixture();
const { briefings, writer, workflows } = fixture;
const noTokens = { input: 0, cachedInput: 0, output: 0, reasoning: 0 };

class Providers {
  static rejecting(cause: Error): BriefingWriteFailedError {
    return new BriefingWriteFailedError({
      reason: 'provider',
      model: null,
      tokens: noTokens,
      costMicroUsd: 0,
      cause,
    });
  }
}

beforeAll(async () => {
  if (databaseUrl !== null) {
    await fixture.launch({
      databaseUrl,
      database: 'dash_test_briefing_write_attempt',
    });
  }
});

beforeEach(() => {
  fixture.begin();
});

afterEach(async () => {
  fixture.end();
  if (databaseUrl !== null) {
    await vi.waitFor(async () => {
      expect(await fixture.unfinished()).toHaveLength(0);
    }, settle);
  }
});

afterAll(async () => {
  await fixture.stop();
});

describe.skipIf(databaseUrl === null)('BriefingWriteAttempt retrying', () => {
  it('tries a rate-limited write once more and records the run that came back', async () => {
    writer.queue(
      Providers.rejecting(
        new OpenAI.RateLimitError(429, undefined, 'Slow down', new Headers()),
      ),
    );

    await workflows.regenerate({ userId: adaId, trigger: 'manual' });

    await vi.waitFor(() => {
      expect(briefings.briefings).toHaveLength(1);
    }, settle);
    expect(writer.calls).toBe(2);
    expect(briefings.briefings[0]?.run.status).toBe('succeeded');
  }, 30_000);

  it('tries a too-short draft once more and adds the first call spend to the run', async () => {
    writer.queue(
      new BriefingWriteFailedError({
        reason: 'tooShort',
        model: 'gpt-test',
        tokens: { input: 500, cachedInput: 0, output: 100, reasoning: 0 },
        costMicroUsd: 77,
      }),
    );

    await workflows.regenerate({ userId: adaId, trigger: 'manual' });

    await vi.waitFor(() => {
      expect(briefings.briefings).toHaveLength(1);
    }, settle);
    expect(writer.calls).toBe(2);
    expect(briefings.briefings[0]?.run.status).toBe('succeeded');
    expect(briefings.briefings[0]?.costMicroUsd).toBe(250 + 77);
  }, 30_000);

  it('fails with the spend of both calls when the draft is too short twice', async () => {
    const tooShort = () =>
      new BriefingWriteFailedError({
        reason: 'tooShort',
        model: 'gpt-test',
        tokens: { input: 500, cachedInput: 0, output: 100, reasoning: 0 },
        costMicroUsd: 77,
      });
    writer.queue(tooShort());
    writer.queue(tooShort());

    await workflows.regenerate({ userId: adaId, trigger: 'manual' });

    await vi.waitFor(() => {
      expect(briefings.briefings).toHaveLength(1);
    }, settle);
    expect(writer.calls).toBe(2);
    expect(briefings.briefings[0]?.run.status).toBe('failed');
    expect(briefings.briefings[0]?.costMicroUsd).toBe(154);
  }, 30_000);
});

describe.skipIf(databaseUrl === null)(
  'BriefingWriteAttempt not retrying',
  () => {
    it('does not retry a timed-out write, since it may already be billed', async () => {
      writer.queue(Providers.rejecting(new OpenAI.APIConnectionTimeoutError()));

      await workflows.regenerate({ userId: adaId, trigger: 'manual' });

      await vi.waitFor(() => {
        expect(briefings.briefings).toHaveLength(1);
      }, settle);
      expect(writer.calls).toBe(1);
      expect(briefings.briefings[0]?.run.status).toBe('failed');
    }, 30_000);

    it('does not retry a provider rejection that is not a rate limit or a lost connection', async () => {
      writer.queue(
        Providers.rejecting(
          new OpenAI.BadRequestError(400, undefined, 'Bad', new Headers()),
        ),
      );

      await workflows.regenerate({ userId: adaId, trigger: 'manual' });

      await vi.waitFor(() => {
        expect(briefings.briefings).toHaveLength(1);
      }, settle);
      expect(writer.calls).toBe(1);
      expect(briefings.briefings[0]?.run.status).toBe('failed');
    }, 30_000);
  },
);

describe('BriefingWriteAttempt untilSettled', () => {
  const failure = (costMicroUsd: number) =>
    new BriefingWriteFailedError({
      reason: 'tooShort',
      model: 'gpt-test',
      tokens: { input: 500, cachedInput: 0, output: 100, reasoning: 0 },
      costMicroUsd,
    });
  const retrying = { maxAttempts: 2, intervalSeconds: 0, backoffRate: 1 };

  class RejectingWriter implements BriefingWriter {
    calls = 0;
    private readonly rejections: BriefingWriteFailedError[];

    constructor(...rejections: BriefingWriteFailedError[]) {
      this.rejections = rejections;
    }

    async write(): Promise<never> {
      const rejection = this.rejections[this.calls];
      this.calls += 1;
      throw rejection ?? new Error('No attempt was expected');
    }

    worstCaseCostMicroUsd(): number {
      return 0;
    }
  }

  it('returns the spend of every attempt in the outcome it settles on', async () => {
    const writer = new RejectingWriter(failure(40), failure(77));

    const outcome = await BriefingWriteAttempt.untilSettled({
      writer,
      snapshot: SampleSnapshot.build(),
      ...retrying,
    });

    expect(writer.calls).toBe(2);
    expect(outcome).toMatchObject({
      status: 'failed',
      failure: {
        costMicroUsd: 117,
        tokens: { input: 1000, output: 200 },
      },
    });
  });

  it('rethrows an error that is not a failed write', async () => {
    const writer = new RejectingWriter();

    await expect(
      BriefingWriteAttempt.untilSettled({
        writer,
        snapshot: SampleSnapshot.build(),
        ...retrying,
      }),
    ).rejects.toThrow('No attempt was expected');
  });
});
