/** GitHub refused to exchange or refresh a user token. `code` is GitHub's own, such as `bad_verification_code`. */
export class GithubOAuthError extends Error {
  override name = 'GithubOAuthError';
  readonly code: string;

  constructor(props: { code: string; description: string | undefined }) {
    super(
      `GitHub refused the user token request (${props.code})${props.description === undefined ? '' : `: ${props.description}`}`,
    );
    this.code = props.code;
  }
}
