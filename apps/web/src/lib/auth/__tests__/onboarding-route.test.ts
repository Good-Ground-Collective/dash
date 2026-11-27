import { describe, expect, it } from 'vitest';
import {
  OnboardingRoute,
  onboardingRecoveryCodesPath,
} from '#lib/auth/onboarding-route.ts';

describe('OnboardingRoute', () => {
  it('leads from the codes step to the second passkey only during setup', () => {
    const during = new URL(onboardingRecoveryCodesPath, 'https://dash.test');
    const later = new URL('/setup/recovery-codes', 'https://dash.test');

    expect(OnboardingRoute.afterRecoveryCodes(during)).toBe(
      '/setup/second-passkey',
    );
    expect(OnboardingRoute.afterRecoveryCodes(later)).toBe('/');
  });
});
