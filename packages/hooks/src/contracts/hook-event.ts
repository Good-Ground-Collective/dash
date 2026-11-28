/** The `dash-hooks` subcommand for each Claude Code hook event it handles. */
export const hookCommands = {
  'session-start': 'SessionStart',
  'session-end': 'SessionEnd',
  'user-prompt-submit': 'UserPromptSubmit',
  'pre-tool-use': 'PreToolUse',
  'post-tool-use': 'PostToolUse',
  notification: 'Notification',
  stop: 'Stop',
  'stop-failure': 'StopFailure',
  'subagent-start': 'SubagentStart',
  'subagent-stop': 'SubagentStop',
} as const;

export type HookCommand = keyof typeof hookCommands;

export type HookEvent = (typeof hookCommands)[HookCommand];
