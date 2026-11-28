import type { z } from 'zod';

import type { HookCommand } from '#src/contracts/hook-event.js';
import type { hookInputSchema } from '#src/contracts/hook-input.js';

export type RecordedPayload = z.input<typeof hookInputSchema>;

interface PayloadPaths {
  cwd: string;
  transcriptPath: string;
}

/** Hook stdin as Claude Code sends it, one per event, shaped after the hooks reference. */
export class RecordedPayloads {
  static readonly SESSION_ID = '3b7e9f20-5c4a-4d1e-8a6b-2f9c0d1e3a4b';

  static for(command: HookCommand, paths: PayloadPaths): RecordedPayload {
    const payloads = {
      ...RecordedPayloads.lifecycle(paths),
      ...RecordedPayloads.tools(paths),
      ...RecordedPayloads.turnEnds(paths),
      ...RecordedPayloads.subagents(paths),
    } satisfies Record<HookCommand, RecordedPayload>;

    return payloads[command];
  }

  /** The `PostToolUse` Claude Code sends when an agent launches `childAgentId` in the background. */
  static backgroundLaunch(
    paths: PayloadPaths,
    childAgentId: string,
  ): RecordedPayload {
    return {
      ...RecordedPayloads.common(paths),
      hook_event_name: 'PostToolUse',
      tool_name: 'Agent',
      tool_input: { description: 'Implement the ticket', prompt: 'Go' },
      tool_response: {
        isAsync: true,
        status: 'async_launched',
        agentId: childAgentId,
        description: 'Implement the ticket',
        prompt: 'Go',
        outputFile: `${paths.transcriptPath}.${childAgentId}`,
      },
      tool_use_id: 'toolu_01LAUNCH',
      duration_ms: 40,
    };
  }

  private static common(paths: PayloadPaths) {
    return {
      session_id: RecordedPayloads.SESSION_ID,
      transcript_path: paths.transcriptPath,
      cwd: paths.cwd,
      permission_mode: 'default',
    };
  }

  private static lifecycle(paths: PayloadPaths) {
    const common = RecordedPayloads.common(paths);
    return {
      'session-start': {
        ...common,
        hook_event_name: 'SessionStart',
        source: 'startup',
        model: 'claude-opus-5',
      },
      'user-prompt-submit': {
        ...common,
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Fix the flaky test',
      },
      'session-end': {
        ...common,
        hook_event_name: 'SessionEnd',
        reason: 'prompt_input_exit',
      },
    };
  }

  private static tools(paths: PayloadPaths) {
    const common = RecordedPayloads.common(paths);
    return {
      'pre-tool-use': {
        ...common,
        hook_event_name: 'PreToolUse',
        tool_name: 'AskUserQuestion',
        tool_use_id: 'toolu_01ABC123',
        tool_input: {
          questions: [
            {
              question: 'Which branch should the fix go on?',
              header: 'Branch',
              options: [
                { label: 'main', description: 'Ship it in the next release' },
                { label: 'release/1.2', description: '' },
              ],
              multiSelect: false,
            },
          ],
        },
      },
      'post-tool-use': {
        ...common,
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_response: { stdout: 'ok', stderr: '' },
        tool_use_id: 'toolu_01DEF456',
        duration_ms: 1200,
      },
      notification: {
        ...common,
        hook_event_name: 'Notification',
        message: 'Claude needs your permission to use Bash',
        notification_type: 'permission_prompt',
      },
    };
  }

  private static turnEnds(paths: PayloadPaths) {
    const common = RecordedPayloads.common(paths);
    return {
      stop: {
        ...common,
        hook_event_name: 'Stop',
        stop_hook_active: false,
        last_assistant_message:
          "I've fixed the flaky test and pushed the branch.\n",
        background_tasks: [],
        session_crons: [],
      },
      'stop-failure': {
        ...common,
        hook_event_name: 'StopFailure',
        error: 'rate_limit',
        error_details: '429 Too Many Requests',
        last_assistant_message: 'API Error: Rate limit reached',
      },
    };
  }

  private static subagents(paths: PayloadPaths) {
    const subagent = {
      ...RecordedPayloads.common(paths),
      agent_id: 'agent-def456',
      agent_type: 'Explore',
    };
    return {
      'subagent-start': { ...subagent, hook_event_name: 'SubagentStart' },
      'subagent-stop': {
        ...subagent,
        hook_event_name: 'SubagentStop',
        stop_hook_active: false,
        agent_transcript_path: `${paths.transcriptPath}.agent`,
        last_assistant_message: 'Analysis complete. Found 3 potential issues.',
      },
    };
  }
}
