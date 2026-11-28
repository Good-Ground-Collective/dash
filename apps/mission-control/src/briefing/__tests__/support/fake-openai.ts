import OpenAI from 'openai';
import { z } from 'zod';

export type FakeOpenAiUsage = {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

const requestBodySchema = z.looseObject({
  model: z.string(),
  max_output_tokens: z.number(),
  instructions: z.string(),
  input: z.string(),
});

export type FakeOpenAiRequestBody = z.infer<typeof requestBodySchema>;

const defaultUsage: FakeOpenAiUsage = {
  inputTokens: 1000,
  cachedTokens: 0,
  outputTokens: 200,
  reasoningTokens: 0,
};

type FakeReply = (
  signal: AbortSignal | null | undefined,
) => Response | Promise<Response>;

/** Stands in for api.openai.com behind the SDK's injected `fetch`. Replies are queued in order; an unqueued call fails the test. */
export class FakeOpenAi {
  readonly requests: FakeOpenAiRequestBody[] = [];
  private readonly replies: FakeReply[] = [];

  readonly fetch = async (
    _input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    this.requests.push(requestBodySchema.parse(JSON.parse(`${init?.body}`)));
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error('No reply queued for the call');
    return reply(init?.signal);
  };

  client(props: { timeoutMs?: number } = {}): OpenAI {
    return new OpenAI({
      apiKey: 'test',
      fetch: this.fetch,
      maxRetries: 0,
      timeout: props.timeoutMs ?? 600_000,
    });
  }

  replyWithText(props: {
    text: string;
    usage?: FakeOpenAiUsage | undefined;
    model?: string | undefined;
  }): this {
    return this.reply(() =>
      Response.json(
        FakeOpenAi.body({
          status: 'completed',
          output: [
            FakeOpenAi.message({ type: 'output_text', text: props.text }),
          ],
          usage: props.usage,
          model: props.model,
        }),
      ),
    );
  }

  replyWithDraft(props: {
    draft: unknown;
    usage?: FakeOpenAiUsage | undefined;
  }): this {
    return this.replyWithText({
      text: JSON.stringify(props.draft),
      usage: props.usage,
    });
  }

  replyIncomplete(props: {
    reason: string;
    usage?: FakeOpenAiUsage | undefined;
  }): this {
    return this.reply(() =>
      Response.json(
        FakeOpenAi.body({
          status: 'incomplete',
          incompleteReason: props.reason,
          output: [
            FakeOpenAi.message({ type: 'output_text', text: '{"parag' }),
          ],
          usage: props.usage,
        }),
      ),
    );
  }

  replyRefusal(props: { usage?: FakeOpenAiUsage | undefined }): this {
    return this.reply(() =>
      Response.json(
        FakeOpenAi.body({
          status: 'completed',
          output: [
            FakeOpenAi.message({
              type: 'refusal',
              refusal: 'I can’t do that.',
            }),
          ],
          usage: props.usage,
        }),
      ),
    );
  }

  replyWithError(status: number): this {
    return this.reply(() =>
      Response.json(
        { error: { message: 'Provider detail', type: 'server_error' } },
        { status },
      ),
    );
  }

  /** Never answers, so the SDK's own timeout aborts the request. */
  replyNever(): this {
    return this.reply(
      (signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(
              new DOMException('The operation was aborted.', 'AbortError'),
            );
          });
        }),
    );
  }

  private reply(reply: FakeReply): this {
    this.replies.push(reply);
    return this;
  }

  private static message(content: Record<string, string>) {
    return {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      status: 'completed',
      content: [{ annotations: [], ...content }],
    };
  }

  private static body(props: {
    status: string;
    output: unknown[];
    incompleteReason?: string;
    usage?: FakeOpenAiUsage | undefined;
    model?: string | undefined;
  }) {
    const usage = props.usage ?? defaultUsage;
    return {
      id: 'resp_1',
      object: 'response',
      created_at: 1,
      status: props.status,
      model: props.model ?? 'gpt-test-2026-11-01',
      incomplete_details:
        props.incompleteReason === undefined
          ? null
          : { reason: props.incompleteReason },
      output: props.output,
      usage: {
        input_tokens: usage.inputTokens,
        input_tokens_details: { cached_tokens: usage.cachedTokens },
        output_tokens: usage.outputTokens,
        output_tokens_details: { reasoning_tokens: usage.reasoningTokens },
        total_tokens: usage.inputTokens + usage.outputTokens,
      },
    };
  }
}
