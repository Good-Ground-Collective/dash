import { z } from 'zod';

/** The colour a bench or agent is drawn in. Stored as a name; each web theme maps it to its own colours. */
export const characterHueSchema = z.enum([
  'amber',
  'green',
  'blue',
  'rose',
  'violet',
  'teal',
  'orange',
  'neutral',
]);

export type CharacterHue = z.infer<typeof characterHueSchema>;

/** Hues as stored. One the enum no longer knows reads as `neutral`, so retiring a hue never breaks a row. */
export const storedCharacterHueSchema = characterHueSchema.catch('neutral');

export interface CharacterHueRegistry {
  /** Every hue, in the order a picker offers them. */
  readonly all: readonly CharacterHue[];
  /** A coloured hue for a bench id or agent name, the same every time, for accounts created without one. */
  forIdentifier(identifier: string): CharacterHue;
}

export class RegisteredCharacterHues implements CharacterHueRegistry {
  readonly all: readonly CharacterHue[] = characterHueSchema.options;
  private readonly coloured = this.all.filter((hue) => hue !== 'neutral');

  forIdentifier(identifier: string): CharacterHue {
    let hash = 0;
    for (const character of identifier) {
      hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 2_147_483_647;
    }
    return this.coloured[hash % this.coloured.length] ?? 'neutral';
  }
}

export const characterHues: CharacterHueRegistry =
  new RegisteredCharacterHues();
