const onboardingParam = 'onboarding';

/** The codes step as setup opens it, marked as part of first-run onboarding. */
export const onboardingRecoveryCodesPath = `/setup/recovery-codes?${onboardingParam}`;

export const secondPasskeyPath = '/setup/second-passkey';

/** Where Continue and Skip lead from the second passkey step: home, the next place a newly set-up person goes. */
export const afterSecondPasskeyPath = '/';

/**
 * Where first-run setup goes after the account exists. Only setup marks the codes step as part
 * of onboarding, so a person the codes gate sends there later goes home after saving and never
 * meets the optional steps.
 */
export class OnboardingRoute {
  /** Where Continue leads once codes are saved: the second passkey step during setup, otherwise home. */
  static afterRecoveryCodes(url: {
    searchParams: Pick<URLSearchParams, 'has'>;
  }): string {
    return url.searchParams.has(onboardingParam) ? secondPasskeyPath : '/';
  }
}
