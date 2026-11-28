import type { AgentHeartbeat } from '@good-ground-collective/agentic-communication-standards';

import { HeartbeatTooLargeError } from '#src/errors.js';
import type { HeartbeatPayload } from '#src/services/heartbeat-mapper/heartbeat-plan.js';
import { TextTrimmer } from '#src/services/text-trimmer/text-trimmer.js';

type PayloadReduction = (payload: HeartbeatPayload) => HeartbeatPayload;

/**
 * Keeps every outbox line, newline included, within 4 KB, so one append is one atomic write and
 * the relay can read a line into a fixed buffer. The schema's own limits allow more than that
 * once non-ASCII text is UTF-8 encoded, so oversized heartbeats lose detail step by step, least
 * useful first, until they fit.
 */
export class LineFitter {
  static readonly LIMIT_BYTES = 4096;

  private static readonly REDUCTIONS: readonly PayloadReduction[] = [
    (payload) => LineFitter.shortenText(payload, 1000, 250),
    (payload) => ({
      ...payload,
      question: payload.question && {
        text: payload.question.text,
        options: payload.question.options
          ?.slice(0, 5)
          .map((option) => ({ label: LineFitter.shorten(option.label, 60) })),
      },
    }),
    (payload) => LineFitter.shortenText(payload, 300, 100),
    (payload) => ({
      ...payload,
      question: payload.question && { text: payload.question.text },
      workspace: undefined,
    }),
    (payload) => LineFitter.shortenText(payload, 100, 50),
  ];

  /** The heartbeat as one JSON line, without its newline. */
  static fit(heartbeat: AgentHeartbeat): string {
    let current = heartbeat;
    let line = JSON.stringify(current);

    for (const reduce of LineFitter.REDUCTIONS) {
      if (LineFitter.fits(line)) {
        return line;
      }
      current = { ...current, payload: reduce(current.payload) };
      line = JSON.stringify(current);
    }
    if (!LineFitter.fits(line)) {
      throw new HeartbeatTooLargeError({
        bytes: Buffer.byteLength(line) + 1,
        limit: LineFitter.LIMIT_BYTES,
      });
    }

    return line;
  }

  private static fits(line: string): boolean {
    return Buffer.byteLength(line) + 1 <= LineFitter.LIMIT_BYTES;
  }

  private static shortenText(
    payload: HeartbeatPayload,
    longLimit: number,
    summaryLimit: number,
  ): HeartbeatPayload {
    return {
      ...payload,
      summary:
        payload.summary && LineFitter.shorten(payload.summary, summaryLimit),
      question: payload.question && {
        ...payload.question,
        text: LineFitter.shorten(payload.question.text, longLimit),
      },
      error: payload.error && {
        kind: payload.error.kind,
        message: LineFitter.shorten(payload.error.message, longLimit),
      },
    };
  }

  private static shorten(text: string, limit: number): string {
    return TextTrimmer.trim(text, limit) ?? text;
  }
}
