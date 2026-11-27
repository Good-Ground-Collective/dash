interface OnboardingReply {
  status: number;
  body: object;
}

/** Mission Control's `GET /onboarding/checklist` for `MissionControlStub`, worked out from the stub's own GitHub state as Mission Control does. */
export class OnboardingStub {
  private readonly githubConnected: () => boolean;
  private readonly anyInitiative: () => boolean;

  constructor(props: {
    githubConnected: () => boolean;
    anyInitiative: () => boolean;
  }) {
    this.githubConnected = props.githubConnected;
    this.anyInitiative = props.anyInitiative;
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
          { id: 'createInitiative', done: this.anyInitiative() },
        ],
      },
    };
  }
}
