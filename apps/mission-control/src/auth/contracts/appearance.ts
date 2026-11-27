import { z } from 'zod';

export const themeNameSchema = z
  .enum(['characters'])
  .describe('A web theme. Characters is the first.');

export const colorModeSchema = z.enum(['light', 'dark']);

export const appearanceSchema = z.object({
  theme: themeNameSchema,
  mode: colorModeSchema,
});

export type ThemeName = z.infer<typeof themeNameSchema>;
export type ColorMode = z.infer<typeof colorModeSchema>;
export type Appearance = z.infer<typeof appearanceSchema>;
