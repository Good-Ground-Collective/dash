import { z } from 'zod';

export const setupStatusSchema = z.object({
  open: z
    .boolean()
    .describe(
      'True while nobody has signed up and a setup token is waiting to be used.',
    ),
});

export type SetupStatus = z.infer<typeof setupStatusSchema>;

export const setupBeginSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1)
    .describe('The one-time token Mission Control logged at boot.'),
  name: z.string().trim().min(1).max(200),
  email: z
    .email()
    .trim()
    .toLowerCase()
    .describe('Identifies the person to break-glass recovery.'),
});

export type SetupBegin = z.input<typeof setupBeginSchema>;

export const setupCheckSchema = setupBeginSchema.pick({ token: true });

export type SetupCheck = z.input<typeof setupCheckSchema>;

export const setupCheckedSchema = z.object({
  valid: z
    .literal(true)
    .describe(
      'The token is the current one. Checking leaves it unspent; a rejected token answers an error instead.',
    ),
});

export type SetupChecked = z.infer<typeof setupCheckedSchema>;

export const setupEnrolmentSchema = z.object({
  enrolment: z
    .string()
    .describe(
      'Single-use and short-lived. Pass it as the passkey registration `context`, with `createSession`.',
    ),
});

export type SetupEnrolment = z.infer<typeof setupEnrolmentSchema>;

/** What a started setup remembers between its begin call and passkey verification. */
export const setupGrantSchema = z.object({
  tokenHash: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
});

export type SetupGrant = z.infer<typeof setupGrantSchema>;
