import { z } from 'zod';

/** How many codes a set holds. */
export const recoveryCodesPerSet = 10;

export const recoveryCodeStateSchema = z.enum(['pending', 'active', 'used']);

export type RecoveryCodeState = z.infer<typeof recoveryCodeStateSchema>;

export const recoveryCodeStatusSchema = z.object({
  confirmed: z
    .boolean()
    .describe(
      'True once the person has confirmed saving a set. Until then, send them to the codes step.',
    ),
  remaining: z
    .number()
    .int()
    .min(0)
    .describe('Unused codes left in the confirmed set.'),
});

export type RecoveryCodeStatus = z.infer<typeof recoveryCodeStatusSchema>;

export const recoveryCodeSetSchema = z.object({
  setId: z
    .uuid()
    .describe('Pass it to confirm once the person has saved the codes.'),
  codes: z
    .array(z.string())
    .length(recoveryCodesPerSet)
    .describe('Shown once, formatted `xxxx-xxxx`. Only their hashes are kept.'),
});

export type RecoveryCodeSet = z.infer<typeof recoveryCodeSetSchema>;

export const recoveryCodeConfirmSchema = z.object({
  setId: z.uuid(),
});

export type RecoveryCodeConfirm = z.input<typeof recoveryCodeConfirmSchema>;

export const recoveryRedeemSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(320),
  code: z.string().max(64).describe('Case, spaces and hyphens are ignored.'),
});

export type RecoveryRedeem = z.input<typeof recoveryRedeemSchema>;

export const recoveryEnrolmentSchema = z.object({
  enrolment: z
    .string()
    .describe(
      'Single-use and short-lived. Pass it as the passkey registration `context`, with `createSession`.',
    ),
});

export type RecoveryEnrolment = z.infer<typeof recoveryEnrolmentSchema>;

/** What a recovery enrolment remembers until its passkey is registered: whose it is and, for a code, which one it spends. */
export const recoveryGrantSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('code'), userId: z.uuid(), codeId: z.uuid() }),
  z.object({ method: z.literal('link'), userId: z.uuid() }),
]);

export type RecoveryGrant = z.infer<typeof recoveryGrantSchema>;

export const recoveryLinkSchema = z.object({
  url: z
    .url()
    .describe(
      "The web app's `/recover/passkey` page, with the enrolment in the fragment so it stays out of server logs.",
    ),
  expiresAt: z.date(),
});

export type RecoveryLink = z.infer<typeof recoveryLinkSchema>;
