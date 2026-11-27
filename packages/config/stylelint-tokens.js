/** Colour functions a theme file may use and nothing else may. */
export const colourFunctions = [
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
];

/** A font token, as regex source: `var(--font-body)`. */
export const fontToken = String.raw`var\(--font-[\w-]+\)`;

/** A font shorthand may lead with a size, weight or style, then must name one font token. */
export const fontShorthand = String.raw`^(?:[^,]*\s)?${fontToken}$`;
