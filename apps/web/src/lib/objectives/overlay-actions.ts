import { z } from 'zod';
import {
  type EpicObjective,
  type InitiativeObjective,
  type OverlayChanges,
  prioritySchema,
} from '#lib/api/objectives-contracts.ts';

type Objective = InitiativeObjective | EpicObjective;
type Priority = z.infer<typeof prioritySchema>;

/** A field Dash may set, with Dash's current value, or `null` when unset. */
export interface EditableField<T> {
  current: T | null;
}

/** What the overlay menu offers for one initiative or epic. A field is `null` when the tracker owns it. */
export interface OverlayActionSet {
  park: boolean;
  unpark: boolean;
  manualProgress: EditableField<number> | null;
  priority: EditableField<Priority> | null;
  dueDate: EditableField<string> | null;
}

/** One overlay change for one initiative or epic, as Mission Control takes it. */
export interface OverlayForm {
  id: string;
  changes: OverlayChanges;
}

const blankAsNull = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value));

/** The overlay form as the browser posts it: `id`, `field`, and `value`, where a blank value clears the field. */
export const overlayFormSchema = z
  .object({ id: z.string().min(1) })
  .and(
    z.discriminatedUnion('field', [
      z.object({
        field: z.literal('parked'),
        value: z.enum(['true', 'false']).transform((value) => value === 'true'),
      }),
      z.object({
        field: z.literal('manualProgress'),
        value: blankAsNull
          .transform((value) => (value === null ? null : Number(value)))
          .pipe(z.number().int().min(0).max(100).nullable()),
      }),
      z.object({
        field: z.literal('priority'),
        value: blankAsNull.pipe(prioritySchema.nullable()),
      }),
      z.object({
        field: z.literal('dueDate'),
        value: blankAsNull.pipe(z.iso.date().nullable()),
      }),
    ]),
  )
  .transform((form): OverlayForm => ({
    id: form.id,
    changes: { [form.field]: form.value },
  }));

/** What the overlay form action answers: the row it was for, and `message` when the change didn't save. */
export const overlayResultSchema = z.object({
  overlay: z.object({
    id: z.string().nullable(),
    message: z.string().nullable(),
  }),
});

export type OverlayResult = z.infer<typeof overlayResultSchema>;

export class OverlayActions {
  /** Parking is always Dash's; priority, due date and manual progress only while the tracker has none. Done follows the tracker, so it can't be parked. */
  static for(objective: Objective): OverlayActionSet {
    const { priority, dueDate, progress } = objective;
    return {
      park: objective.status === 'active',
      unpark: objective.status === 'parked',
      manualProgress:
        progress.source === 'tracker'
          ? null
          : {
              current: progress.source === 'manual' ? progress.percent : null,
            },
      priority:
        priority?.source === 'tracker'
          ? null
          : { current: priority?.value ?? null },
      dueDate:
        dueDate?.source === 'tracker'
          ? null
          : { current: dueDate?.value ?? null },
    };
  }

  /** Parses a posted overlay form, or `null` when it isn't one. */
  static parseForm(form: FormData): OverlayForm | null {
    const parsed = overlayFormSchema.safeParse(Object.fromEntries(form));
    return parsed.success ? parsed.data : null;
  }
}
