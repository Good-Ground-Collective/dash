interface OnboardingReply {
  status: number;
  body: object;
}

/** Mission Control's `GET /onboarding/checklist` for `MissionControlStub`, worked out from the stub's own passkeys and GitHub state as Mission Control does. */
export class OnboardingStub {
  private readonly passkeys: () => number;
  private readonly githubConnected: () => boolean;

  constructor(props: {
    passkeys: () => number;
    githubConnected: () => boolean;
  }) {
    this.passkeys = props.passkeys;
    this.githubConnected = props.githubConnected;
  }

  checklist(props: { signedIn: boolean }): OnboardingReply {
    if (!props.signedIn) {
      return { status: 401, body: { code: 'SIGN_IN_REQUIRED' } };
    }
    return {
      status: 200,
      body: {
        items: [
          { id: 'connectGitHub', done: this.githubConnected() },
          { id: 'secondPasskey', done: this.passkeys() >= 2 },
        ],
      },
    };
  }
}
