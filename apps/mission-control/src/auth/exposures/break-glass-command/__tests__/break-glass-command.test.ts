import { describe, expect, it } from 'vitest';

import { PasskeyIdentity } from '#src/auth/__tests__/support/passkey-identity.ts';
import { BreakGlassCommand } from '#src/auth/exposures/break-glass-command/break-glass-command.ts';

class Captured {
  text = '';

  write(text: string): void {
    this.text += text;
  }
}

class CommandRun {
  readonly fixture = new PasskeyIdentity();
  readonly stdout = new Captured();
  readonly stderr = new Captured();
  readonly command = new BreakGlassCommand({
    identity: this.fixture.identity,
    stdout: this.stdout,
    stderr: this.stderr,
  });
}

describe('BreakGlassCommand', () => {
  it('prints a single-use enrolment link for a person', async () => {
    const run = new CommandRun();
    await run.fixture.firstPerson();

    const code = await run.command.run(['admin', 'recover', 'ada@example.com']);

    expect(code).toBe(0);
    expect(run.stdout.text).toMatch(
      /http:\/\/localhost:5173\/recover\/passkey#enrolment=recovery-enrolment%3A\w+/u,
    );
    expect(run.stdout.text).toContain('expires at');
    expect(run.stderr.text).toBe('');
  });

  it('says so when nobody has that email', async () => {
    const run = new CommandRun();
    await run.fixture.firstPerson();

    const code = await run.command.run([
      'admin',
      'recover',
      'nobody@example.com',
    ]);

    expect(code).toBe(1);
    expect(run.stderr.text).toContain('nobody@example.com');
    expect(run.stdout.text).toBe('');
  });

  it.each([
    [[]],
    [['admin']],
    [['admin', 'recover']],
    [['admin', 'recover', 'not-an-email']],
    [['admin', 'recover', 'ada@example.com', 'extra']],
    [['recover', 'ada@example.com']],
  ])('prints usage for %j', async (argv) => {
    const run = new CommandRun();

    const code = await run.command.run(argv);

    expect(code).toBe(64);
    expect(run.stderr.text).toContain('dash admin recover <email>');
  });
});
