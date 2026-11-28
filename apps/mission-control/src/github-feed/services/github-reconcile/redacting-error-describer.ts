import { z } from 'zod';

const maxMessageLength = 200;
const maxIssues = 5;
const tokenPatterns = [
  /\b(?:ghs|ghp|gho|ghu|ghr)_[A-Za-z0-9_]+/g,
  /\bgithub_pat_[A-Za-z0-9_]+/g,
  /\b(?:token|bearer)[\s=:]+\S+/gi,
];
const urlPattern = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

const detailSchema = z.object({
  code: z.union([z.string(), z.number()]).optional(),
  status: z.int().optional(),
});

/** Describes a failed read for logs, so the cause can be found without database access. */
export interface ErrorDescriber {
  describe(error: Error): string;
}

/**
 * Names the error's class, its code or status, a short first line of its message and its
 * cause's class. Provider, database and validation errors can carry request headers, URLs and
 * credentials, so tokens and URLs are replaced, only the first line of the message is kept,
 * and a validation error lists where it failed instead of echoing the rejected values.
 */
export class RedactingErrorDescriber implements ErrorDescriber {
  describe(error: Error): string {
    const summary =
      error instanceof z.ZodError
        ? this.issuesOf(error)
        : this.messageOf(error.message);
    const described = [`${error.name}${this.detailOf(error)}`, summary]
      .filter((part) => part !== '')
      .join(': ');

    if (error.cause instanceof Error) {
      return `${described} (caused by ${error.cause.name}${this.detailOf(error.cause)})`;
    }
    return described;
  }

  private detailOf(error: Error): string {
    const { code, status } = detailSchema.catch({}).parse(error);
    const details = [
      code === undefined ? '' : `code ${code}`,
      status === undefined ? '' : `status ${status}`,
    ].filter((detail) => detail !== '');
    return details.length === 0 ? '' : ` [${details.join(', ')}]`;
  }

  private issuesOf(error: z.ZodError): string {
    const listed = error.issues
      .slice(0, maxIssues)
      .map(
        ({ path, code }) => `${path.map(String).join('.') || '(root)'} ${code}`,
      );
    const more = error.issues.length - listed.length;
    return more > 0
      ? `${listed.join(', ')}, and ${more} more`
      : listed.join(', ');
  }

  private messageOf(message: string): string {
    const [firstLine = ''] = message.split('\n');
    let safe = firstLine.replace(urlPattern, '[url]');
    for (const pattern of tokenPatterns) {
      safe = safe.replace(pattern, '[redacted]');
    }
    safe = safe.trim();
    return safe.length > maxMessageLength
      ? `${safe.slice(0, maxMessageLength)}…`
      : safe;
  }
}
