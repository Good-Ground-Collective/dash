const onboardingParam = 'onboarding';

/** The codes step as setup opens it, marked as part of first-run onboarding. */
export const onboardingRecoveryCodesPath = `/setup/recovery-codes?${onboardingParam}`;

export const secondPasskeyPath = '/setup/second-passkey';

/** The Connect GitHub step, which follows the codes step and the second passkey step. */
export const connectGithubPath = '/setup/github';

/** Where Continue and Skip lead from the second passkey step. */
export const afterSecondPasskeyPath = connectGithubPath;

/**
 * Where first-run setup goes after the account exists. Only setup marks the codes step as part
 * of onboarding, so a person the codes gate sends there later skips the second passkey step and
 * goes straight to Connect GitHub.
 */
export class OnboardingRoute {
  /** Where Continue leads once codes are saved: the second passkey step during setup, otherwise Connect GitHub. */
  static afterRecoveryCodes(url: {
    searchParams: Pick<URLSearchParams, 'has'>;
  }): string {
    return url.searchParams.has(onboardingParam)
      ? secondPasskeyPath
      : connectGithubPath;
  }
}
