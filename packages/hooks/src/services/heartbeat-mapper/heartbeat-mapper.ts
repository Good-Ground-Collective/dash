import type { knownHarnesses } from '@good-ground-collective/agentic-communication-standards';

import type { HookEvent } from '#src/contracts/hook-event.js';
import type { HookInput } from '#src/contracts/hook-input.js';
import type {
  HeartbeatDraft,
  HeartbeatPayload,
  HeartbeatPlan,
} from '#src/services/heartbeat-mapper/heartbeat-plan.js';
import { TextTrimmer } from '#src/services/text-trimmer/text-trimmer.js';
import { TranscriptReader } from '#src/services/transcript-reader/transcript-reader.js';
import { WorkspaceProbe } from '#src/services/workspace-probe/workspace-probe.js';

type Status = HeartbeatPayload['status'];

type Question = NonNullable<HeartbeatPayload['question']>;

/** What the mapper needs besides the hook's own input. */
export interface HeartbeatContext {
  event: HookEvent;
  input: HookInput;
  machine?: string | undefined;
}

/** Decides which heartbeat, if any, a Claude Code hook event becomes. */
export class HeartbeatMapper {
  static readonly HARNESS: (typeof knownHarnesses)[number] = 'claude-code';

  /** The tool Claude Code asks the person a multiple-choice question with. Its finishing is the answer. */
  static readonly ASK_TOOL = 'AskUserQuestion';

  /** Notifications that mean Claude Code is waiting on the person. The idle prompt isn't one: `Stop` already said the turn is complete. */
  static readonly NEEDS_INPUT_NOTIFICATIONS: ReadonlySet<string> = new Set([
    'permission_prompt',
    'elicitation_dialog',
    'elicitation_url_dialog',
  ]);

  /** The tools that launch a subagent; older Claude Code versions call it `Task`. */
  static readonly LAUNCH_TOOLS: ReadonlySet<string> = new Set([
    'Agent',
    'Task',
  ]);

  static readonly ASYNC_LAUNCHED = 'async_launched';

  static plan(context: HeartbeatContext): HeartbeatPlan | undefined {
    const { event, input } = context;

    if (event === 'SessionStart') {
      return {
        draft: HeartbeatMapper.draft(
          context,
          input.source === 'compact' ? 'working' : 'complete',
        ),
        condition: 'always',
        sessionModel: TextTrimmer.trim(input.model, 100),
      };
    }
    if (event === 'SessionEnd') {
      return {
        ...HeartbeatMapper.unconditionalPlan(context, 'complete'),
        endsSession: true,
      };
    }
    if (event === 'UserPromptSubmit') {
      return HeartbeatMapper.unconditionalPlan(context, 'working');
    }
    if (event === 'PostToolUse') {
      const launchedChild = HeartbeatMapper.launchedChild(input);
      if (launchedChild !== undefined) {
        return {
          draft: HeartbeatMapper.draft(context, 'working'),
          condition: 'liveness',
          launchedChild,
        };
      }

      return input.toolName === HeartbeatMapper.ASK_TOOL
        ? {
            draft: HeartbeatMapper.draft(context, 'working'),
            condition: 'answer',
            toolUseId: input.toolUseId,
          }
        : {
            draft: HeartbeatMapper.draft(context, 'working'),
            condition: 'liveness',
          };
    }
    if (event === 'PreToolUse') {
      return HeartbeatMapper.askedQuestion(context);
    }
    if (event === 'Notification') {
      return HeartbeatMapper.notification(context);
    }

    return HeartbeatMapper.turnEnd(context);
  }

  private static turnEnd(context: HeartbeatContext): HeartbeatPlan | undefined {
    const { event, input } = context;

    if (event === 'Stop') {
      const reported = input.backgroundTaskCount;
      const hasBackgroundTasks = (reported ?? 0) > 0;
      return {
        draft: {
          ...HeartbeatMapper.draft(
            context,
            hasBackgroundTasks ? 'waiting' : 'complete',
          ),
          summary: HeartbeatMapper.summary(
            input.lastAssistantMessage,
            input.transcriptPath,
          ),
        },
        condition: 'always',
        settlesChildren: reported === undefined,
        reportedBackgroundTasks: reported,
      };
    }
    if (event === 'StopFailure') {
      const kind = TextTrimmer.trim(input.error, 100) ?? 'unknown';
      const message = input.errorDetails || input.lastAssistantMessage || kind;
      return {
        draft: {
          ...HeartbeatMapper.draft(context, 'error'),
          error: { kind, message: TextTrimmer.trim(message, 2000) ?? kind },
        },
        condition: 'always',
      };
    }
    if (input.agentId === undefined || input.agentId === '') {
      return undefined;
    }
    if (event === 'SubagentStart') {
      return HeartbeatMapper.unconditionalPlan(context, 'working');
    }

    return {
      draft: {
        ...HeartbeatMapper.draft(context, 'complete'),
        summary: HeartbeatMapper.summary(
          input.lastAssistantMessage,
          input.agentTranscriptPath,
        ),
      },
      condition: 'known-subagent',
      settlesChildren: true,
    };
  }

  /** The background subagent a finished Agent tool call started, if it was launched asynchronously. */
  private static launchedChild(input: HookInput): string | undefined {
    const isLaunch =
      input.toolName !== undefined &&
      HeartbeatMapper.LAUNCH_TOOLS.has(input.toolName);
    if (
      !isLaunch ||
      input.toolResponseStatus !== HeartbeatMapper.ASYNC_LAUNCHED ||
      !input.launchedAgentId
    ) {
      return undefined;
    }

    return input.launchedAgentId;
  }

  /** AskUserQuestion can ask up to four questions at once; their texts are joined, and options are kept only when there is one. */
  private static askedQuestion(
    context: HeartbeatContext,
  ): HeartbeatPlan | undefined {
    const asked = (context.input.questions ?? []).filter(
      (item) => item.question !== '',
    );
    if (
      context.input.toolName !== HeartbeatMapper.ASK_TOOL ||
      asked.length === 0
    ) {
      return undefined;
    }

    const options = asked.length === 1 ? (asked[0]?.options ?? []) : [];
    const kept = options.slice(0, 10).flatMap((option) => {
      const label = TextTrimmer.trim(option.label, 200);
      return label === undefined
        ? []
        : [{ label, description: TextTrimmer.trim(option.description, 500) }];
    });

    return {
      ...HeartbeatMapper.question(context, {
        text: asked.map((item) => item.question).join('\n'),
        options: kept.length > 0 ? kept : undefined,
      }),
      awaitsAnswer: true,
      toolUseId: context.input.toolUseId,
    };
  }

  private static notification(
    context: HeartbeatContext,
  ): HeartbeatPlan | undefined {
    const type = context.input.notificationType ?? '';
    if (!HeartbeatMapper.NEEDS_INPUT_NOTIFICATIONS.has(type)) {
      return undefined;
    }

    return HeartbeatMapper.question(context, {
      text: context.input.message || type,
    });
  }

  private static question(
    context: HeartbeatContext,
    question: Question,
  ): HeartbeatPlan {
    return {
      draft: {
        ...HeartbeatMapper.draft(context, 'question'),
        question: {
          ...question,
          text: TextTrimmer.trim(question.text, 2000) ?? question.text,
        },
      },
      condition: 'always',
    };
  }

  private static unconditionalPlan(
    context: HeartbeatContext,
    status: Status,
  ): HeartbeatPlan {
    return {
      draft: HeartbeatMapper.draft(context, status),
      condition: 'always',
    };
  }

  private static draft(
    context: HeartbeatContext,
    status: Status,
  ): HeartbeatDraft {
    const { input, machine } = context;
    const agentType = TextTrimmer.trim(input.agentType, 100);

    return {
      sessionId: input.sessionId,
      agentId: TextTrimmer.trim(input.agentId, 256),
      agent: agentType === undefined ? undefined : { type: agentType },
      harness: HeartbeatMapper.HARNESS,
      status,
      workspace: WorkspaceProbe.describe(input.cwd),
      machine,
    };
  }

  /** The last assistant message from the hook input, else from the transcript; an unreadable transcript just leaves it out. */
  private static summary(
    message: string | undefined,
    transcriptPath: string | undefined,
  ): string | undefined {
    const text =
      message?.trim() || TranscriptReader.lastAssistantText(transcriptPath);
    return TextTrimmer.trim(text, 500);
  }
}
