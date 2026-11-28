import { FakeOpenAi } from '#src/briefing/__tests__/support/fake-openai.ts';
import { SampleSnapshot } from '#src/briefing/__tests__/support/sample-snapshot.ts';
import { BriefingWriteFailedError } from '#src/briefing/errors.ts';
import { OpenAiBriefingWriter } from '#src/briefing/services/briefing-writer/briefing-writer.ts';

export const settings = {
  model: 'gpt-test',
  prices: {
    inputUsdPerMTok: 0.1,
    cachedInputUsdPerMTok: 0.01,
    outputUsdPerMTok: 0.5,
  },
  maxOutputTokens: 4000,
};

export const briefingDraft = {
  opening: {
    segments: [
      { text: 'Your briefing work is ', ref: null },
      { text: 'due on the 1st', ref: 'o1' },
      { text: '. The card is up for review.', ref: null },
    ],
  },
  actions: [
    {
      segments: [
        { text: 'Review ', ref: null },
        { text: 'the card', ref: 'pr1' },
        { text: '.', ref: null },
      ],
    },
  ],
  closing: {
    segments: [
      { text: 'The pace is too thin to call. Check back soon.', ref: null },
    ],
  },
};

export class BriefingWriterHarness {
  readonly fake = new FakeOpenAi();
  readonly writer = new OpenAiBriefingWriter({
    client: this.fake.client(),
    settings,
  });

  async failure(): Promise<BriefingWriteFailedError> {
    try {
      await this.writer.write(SampleSnapshot.build());
    } catch (error) {
      if (error instanceof BriefingWriteFailedError) return error;
      throw error;
    }
    throw new Error('Expected the write to fail');
  }
}

