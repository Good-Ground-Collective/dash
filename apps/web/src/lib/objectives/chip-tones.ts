import { z } from 'zod';
import { prioritySchema } from '#lib/api/objectives-contracts.ts';

export const chipToneSchema = z.enum([
  'p1',
  'p2',
  'p3',
  'neutral',
  'warn',
  'hint',
]);

export type ChipTone = z.infer<typeof chipToneSchema>;

/** The colour a chip takes for the kind of fact it states. */
export class ChipTones {
  /** P1 reads as urgent, P2 as a warning and P3 as ordinary. */
  static forPriority(label: string): ChipTone {
    return chipToneSchema.parse(prioritySchema.parse(label).toLowerCase());
  }
}
