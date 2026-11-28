import { z } from 'zod';
import {
  type CheckChoice,
  checkChoiceSchema,
} from '#lib/watched-checks/repository-check-choices.ts';

const choicePrefix = 'choice:';

export const addRuleFormSchema = z.object({
  pattern: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[^*]*\*?$/u),
});

export const removeRuleFormSchema = z.object({ id: z.string().min(1) });

const repositoryFormSchema = z.object({
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/u),
  choices: z.map(z.string().min(1), checkChoiceSchema),
});

export interface RepositoryForm {
  repository: string;
  choices: ReadonlyMap<string, CheckChoice>;
}

/** The forms Settings posts, as the browser sends them. A form that isn't one of these parses to `null`. */
export class WatchedChecksForms {
  static addRule(data: FormData): z.output<typeof addRuleFormSchema> | null {
    const parsed = addRuleFormSchema.safeParse({
      pattern: data.get('pattern'),
    });
    return parsed.success ? parsed.data : null;
  }

  static removeRule(
    data: FormData,
  ): z.output<typeof removeRuleFormSchema> | null {
    const parsed = removeRuleFormSchema.safeParse({ id: data.get('id') });
    return parsed.success ? parsed.data : null;
  }

  /** The repository, and each check's answer from fields named `choice:<check name>`. */
  static repository(data: FormData): RepositoryForm | null {
    const choices = new Map<string, unknown>();
    for (const [field, value] of data.entries()) {
      if (field.startsWith(choicePrefix)) {
        choices.set(field.slice(choicePrefix.length), value);
      }
    }
    const parsed = repositoryFormSchema.safeParse({
      repository: data.get('repository'),
      choices,
    });
    return parsed.success ? parsed.data : null;
  }

  /** The field a check's answer is posted under. */
  static choiceField(checkName: string): string {
    return `${choicePrefix}${checkName}`;
  }
}
