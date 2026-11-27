import { z } from 'zod';

/** A bench's or agent's colour, by name. Each theme maps it to `--char-<hue>-bg` and `--char-<hue>-fg`. */
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

/** A hue as Mission Control reports it. Missing or unknown reads as `neutral`, so a hue added there first doesn't break the page. */
export const reportedCharacterHueSchema = characterHueSchema.catch('neutral');
