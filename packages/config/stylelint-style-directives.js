import stylelint from 'stylelint';

const ruleName = 'dash/style-directive-tokens';

const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (property, value) =>
    `Use a theme token for ${property}, not "${value}"`,
});

/** Properties whose value carries a colour. Border widths, styles and radii are not among them. */
const colourProperties =
  /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|stop-color|flood-color|lighting-color|box-shadow|text-shadow|caret-color|accent-color|text-decoration-color)$/u;

const fontProperties = /^font(-family)?$/u;

/** A literal colour: hex, or a colour function. */
const rawColour =
  /#[\da-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/iu;

/** Words a colour-carrying value may hold besides tokens and numbers: keywords for shadows, borders and outlines. Any other word is read as a named colour. */
const colourKeywords = new Set([
  'currentcolor',
  'transparent',
  'inherit',
  'initial',
  'unset',
  'revert',
  'none',
  'auto',
  'inset',
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'outset',
  'hidden',
  'thin',
  'medium',
  'thick',
]);

/** A font shorthand may lead with a size, weight or style, then must name one font token. */
const fontValue = /^(inherit|(?:[^,]*\s)?var\(--font-[\w-]+\))$/iu;

/** `style:property=` directives and SVG colour attributes, with a quoted or braced value. */
const binding =
  /(?:\bstyle:([a-z-]+)(?:\|important)?|(?<=\s)(fill|stroke|stop-color|flood-color|lighting-color))=(?:"([^"]*)"|'([^']*)'|\{((?:[^{}]|\$\{[^{}]*\})*)\})/giu;

/** The string literals inside a braced expression, so `{dark ? 'white' : x}` is checked too. A template's `${…}` parts become a placeholder token. */
const stringLiterals = (expression) =>
  [...expression.matchAll(/(['"`])((?:(?!\1).)*)\1/gsu)].map(([, , text]) =>
    text.replaceAll(/\$\{[^{}]*\}/gu, 'x'),
  );

/** The 1-based line and column of `index` in `source`. */
const position = (source, index) => {
  const before = source.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
};

/** Whether a literal value breaks the contract for `property`. */
const breaks = (property, value) => {
  if (rawColour.test(value)) return true;
  if (fontProperties.test(property)) return !fontValue.test(value.trim());
  if (!colourProperties.test(property)) return false;
  return value
    .replaceAll(/var\(--[\w-]+\)/gu, ' ')
    .split(/[\s,/]+/u)
    .filter((part) => part !== '' && !/^[+-]?[\d.]/u.test(part))
    .some((word) => !colourKeywords.has(word.toLowerCase()));
};

/**
 * Svelte `style:` directives and SVG colour attributes aren't CSS, so postcss-html never shows
 * them to the other rules. This rule reads them from the component source and holds them to the
 * same contract as stylesheets: no hex, colour functions or named colours, and fonts only from
 * `var(--font-…)` tokens. Composite values such as `1px solid var(--line)` and keywords such as
 * `none` pass. In a braced expression only the string literals are checked, since the rest isn't
 * known until runtime.
 */
const rule = (enabled) => (root, result) => {
  if (!enabled) return;
  const document = root.document;
  if (document === undefined || document.first !== root) return;
  const file = root.source?.input.file ?? '';
  if (!file.endsWith('.svelte')) return;

  const source = document.source?.input.css ?? '';
  for (const match of source.matchAll(binding)) {
    const [, directive, attribute, double, single, braced] = match;
    const property = directive ?? attribute ?? '';
    const values =
      braced === undefined ? [double ?? single ?? ''] : stringLiterals(braced);
    const offending = values.find((value) => breaks(property, value));
    if (offending !== undefined) {
      stylelint.utils.report({
        result,
        ruleName,
        message: messages.rejected(
          directive === undefined ? property : `style:${property}`,
          offending,
        ),
        node: root,
        start: position(source, match.index),
        end: position(source, match.index + match[0].length),
      });
    }
  }
};

rule.ruleName = ruleName;
rule.messages = messages;

export default stylelint.createPlugin(ruleName, rule);
