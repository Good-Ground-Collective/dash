import { z } from 'zod';

import { RecoveryPersonNotFoundError } from '#src/auth/errors.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';

const usage = 'Usage: dash admin recover <email>';

const recoverArgumentsSchema = z.tuple([
  z.literal('admin'),
  z.literal('recover'),
  z.email(),
]);

/** Where the command writes. `process.stdout` and `process.stderr` in production. */
export interface CommandOutput {
  write(text: string): void;
}

/**
 * `dash admin recover <email>`, run inside the Mission Control container on the host. Shell
 * access to the host is the root of trust, so it needs no other proof: it prints a single-use
 * link that registers a new passkey for that person and signs them in, valid for 15 minutes.
 */
export class BreakGlassCommand {
  private readonly identity: Pick<Identity, 'auth' | 'recovery'>;
  private readonly stdout: CommandOutput;
  private readonly stderr: CommandOutput;

  constructor(props: {
    identity: Pick<Identity, 'auth' | 'recovery'>;
    stdout: CommandOutput;
    stderr: CommandOutput;
  }) {
    this.identity = props.identity;
    this.stdout = props.stdout;
    this.stderr = props.stderr;
  }

  /** Runs one command line, without the program name, and resolves to the exit code. */
  async run(argv: readonly string[]): Promise<number> {
    const parsed = recoverArgumentsSchema.safeParse(argv);
    if (!parsed.success) {
      this.stderr.write(`${usage}\n`);
      return 64;
    }

    const [, , email] = parsed.data;
    try {
      const link = await this.identity.recovery.issueLink({
        context: await this.identity.auth.$context,
        email,
      });
      this.stdout.write(
        [
          `Open this link on the device that should get the new passkey. It works once and expires at ${link.expiresAt.toISOString()}.`,
          '',
          link.url,
          '',
        ].join('\n'),
      );
      return 0;
    } catch (cause) {
      if (cause instanceof RecoveryPersonNotFoundError) {
        this.stderr.write(`${cause.message}\n`);
        return 1;
      }
      throw cause;
    }
  }
}
