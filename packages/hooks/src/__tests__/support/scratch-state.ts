import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  type AgentHeartbeat,
  agentHeartbeat,
} from '@good-ground-collective/agentic-communication-standards';

import { FakeIngest } from '#src/__tests__/support/fake-ingest.js';
import {
  type RecordedPayload,
  RecordedPayloads,
} from '#src/__tests__/support/recorded-payloads.js';
import { HooksConfig } from '#src/config/hooks-config.js';
import { RelayConfig } from '#src/config/relay-config.js';
import { ClaudeCodeHeartbeatHook } from '#src/services/heartbeat-hook/heartbeat-hook.js';
import { FileSessionLedger } from '#src/services/session-ledger/session-ledger.js';

/** A throwaway state directory with helpers to run hooks against it and read back the outbox. */
export class ScratchState {
  readonly directory: string;
  readonly config: HooksConfig;

  constructor() {
    this.directory = mkdtempSync(path.join(tmpdir(), 'dash-hooks-'));
    this.config = new HooksConfig({
      stateDirectory: this.directory,
      machine: 'test-machine',
    });
  }

  hook(): ClaudeCodeHeartbeatHook {
    return new ClaudeCodeHeartbeatHook({ config: this.config });
  }

  async run(
    command: string,
    payload: RecordedPayload,
    now = new Date('2026-11-27T09:30:00Z'),
  ): Promise<AgentHeartbeat | undefined> {
    return this.hook().handle({
      command,
      stdin: JSON.stringify(payload),
      now,
    });
  }

  /** Writes `turns` prompt-then-stop pairs, two heartbeats each, as a session would. */
  async writeTurns(
    turns: number,
    sessionId: string = RecordedPayloads.SESSION_ID,
  ): Promise<void> {
    const paths = { cwd: this.directory, transcriptPath: 'unused' };
    for (let turn = 0; turn < turns; turn += 1) {
      for (const command of ['user-prompt-submit', 'stop'] as const) {
        await this.run(command, {
          ...RecordedPayloads.for(command, paths),
          session_id: sessionId,
        });
      }
    }
  }

  /** A relay configuration for the fake ingest at `url`, which exits soon after draining. */
  relayConfig(url: string): RelayConfig {
    return new RelayConfig({
      apiUrl: url,
      apiKey: FakeIngest.API_KEY,
      reporterName: FakeIngest.REPORTER,
      idleExitMs: 50,
    });
  }

  async relayLog(): Promise<string> {
    return readFile(this.config.relayLogPath, 'utf8').catch(() => '');
  }

  outboxPath(sessionId: string): string {
    return path.join(
      this.config.outboxDirectory,
      `${FileSessionLedger.fileStem(sessionId)}.jsonl`,
    );
  }

  /** Every outbox line, each parsed with the standards schema so a bad line fails the test. */
  async heartbeats(sessionId: string): Promise<AgentHeartbeat[]> {
    const text = await readFile(this.outboxPath(sessionId), 'utf8').catch(
      () => '',
    );
    return text
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => agentHeartbeat.schema.parse(JSON.parse(line)));
  }

  async log(): Promise<string> {
    return readFile(this.config.logPath, 'utf8').catch(() => '');
  }

  async remove(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true, maxRetries: 3 });
  }
}
