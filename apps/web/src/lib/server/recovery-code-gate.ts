import type { RecoveryCodeStatus } from '#lib/api/mission-control.ts';

export const recoveryCodesPath = '/setup/recovery-codes';

/** Pages a person without confirmed codes can still open: the codes step itself, and the pages around signing in and out. */
const exemptPaths: ReadonlySet<string> = new Set([
  recoveryCodesPath,
  '/setup',
  '/sign-in',
  '/recover',
  '/recover/passkey',
]);

/** Decides whether a page sends a signed-in person to the codes step first. */
export interface RecoveryCodeGate {
  /** Where to send the person instead of `pathname`, or `null` to let them through. */
  redirectFor(props: {
    pathname: string;
    status: RecoveryCodeStatus | null;
  }): string | null;
}

/**
 * Recovery codes are required: until a set is confirmed, every other page sends a signed-in
 * person to the codes step. An unknown status lets them through, so Mission Control being
 * unreachable doesn't trap anyone in a loop.
 */
export class PathRecoveryCodeGate implements RecoveryCodeGate {
  redirectFor(props: {
    pathname: string;
    status: RecoveryCodeStatus | null;
  }): string | null {
    if (props.status === null || props.status.confirmed) return null;

    const pathname = props.pathname.replace(/\/+$/u, '') || '/';
    return exemptPaths.has(pathname) ? null : recoveryCodesPath;
  }
}

export const recoveryCodeGate: RecoveryCodeGate = new PathRecoveryCodeGate();
