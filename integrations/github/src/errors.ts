/** GitHub answered a GraphQL query with errors instead of data. GitHub's messages never include the token. */
export class GithubGraphqlError extends Error {
  override name = 'GithubGraphqlError';

  constructor(props: { messages: readonly string[] }) {
    super(
      `GitHub rejected the GraphQL query: ${props.messages.join('; ') || 'no data returned'}`,
    );
  }
}

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
