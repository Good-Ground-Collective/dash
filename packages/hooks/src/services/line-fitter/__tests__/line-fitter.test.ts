import {
  type AgentHeartbeat,
  agentHeartbeat,
} from '@good-ground-collective/agentic-communication-standards';
import { describe, expect, it } from 'vitest';

import { LineFitter } from '#src/services/line-fitter/line-fitter.js';

class Heartbeats {
  static question(text: string, optionText: string): AgentHeartbeat {
    return agentHeartbeat.schema.parse({
      schemaVersion: '1.0',
      kind: 'agent.heartbeat',
      id: '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f',
      emittedAt: '2026-11-27T09:30:00.000Z',
      payload: {
        sessionId: 'session-1',
        seq: 4,
        harness: 'claude-code',
        status: 'question',
        question: {
          text,
          options: Array.from({ length: 10 }, (_, index) => ({
            label: `${index} ${optionText.slice(0, 190)}`,
            description: optionText.slice(0, 500),
          })),
        },
        workspace: { directory: `/${'d'.repeat(1000)}` },
      },
    });
  }
}

describe('LineFitter', () => {
  it('leaves a heartbeat that already fits as it is', () => {
    const heartbeat = Heartbeats.question('Which branch?', 'main');

    expect(LineFitter.fit(heartbeat)).toBe(JSON.stringify(heartbeat));
  });

  it('fits a question at every schema limit in multi-byte text under 4 KB', () => {
    const heartbeat = Heartbeats.question('質'.repeat(2000), '😀'.repeat(250));

    const line = LineFitter.fit(heartbeat);

    expect(Buffer.byteLength(`${line}\n`)).toBeLessThanOrEqual(
      LineFitter.LIMIT_BYTES,
    );
    const fitted = agentHeartbeat.schema.parse(JSON.parse(line));
    expect(fitted.payload.question?.text.startsWith('質質質')).toBe(true);
    expect(fitted.payload.question?.text.endsWith('…')).toBe(true);
  });
});
