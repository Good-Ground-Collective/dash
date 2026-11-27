import { type HookEvent, hookCommands } from '#src/contracts/hook-event.js';
import { UnknownHookEventError } from '#src/errors.js';

/** Turns a `dash-hooks` subcommand into the hook event it stands for. */
export class HookEventNames {
  static fromCommand(command: string | undefined): HookEvent {
    const entry = Object.entries(hookCommands).find(
      ([name]) => name === command,
    );
    if (entry === undefined) {
      throw new UnknownHookEventError({ command: command ?? '' });
    }

    return entry[1];
  }
}
