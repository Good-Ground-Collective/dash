import stylelint from 'stylelint';

import { colourFunctions, fontShorthand } from './stylelint-tokens.js';

const ruleName = 'dash/style-directive-tokens';

const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (property, value) =>
    `Use a theme token for ${property}, not "${value}"`,
});

const fontProperties = /^font(-family)?$/u;

/** A literal colour: hex, or a colour function. */
const rawColour = new RegExp(
  String.raw`#[\da-f]{3,8}\b|\b(${colourFunctions.join('|')})\(`,
  'iu',
);

/** CSS named colours, as `color-named: never` rejects them in stylesheets. */
const namedColours = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black ' +
    'blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse ' +
    'chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta ' +
    'darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite ' +
    'forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green ' +
    'greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral ' +
    'lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey ' +
    'lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta ' +
    'maroon mediumaquamarine mediumblue mediumorchid mediumpurple ' +
    'mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite ' +
    'navy oldlace olive olivedrab orange orangered orchid palegoldenrod ' +
    'palegreen paleturquoise palevioletred papayawhip peachpuff peru pink ' +
    'plum powderblue purple rebeccapurple red rosybrown royalblue ' +
    'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue ' +
    'slateblue slategray slategrey snow springgreen steelblue tan teal ' +
    'thistle tomato turquoise violet wheat white whitesmoke yellow ' +
    'yellowgreen '
  )
    .split(' ')
    .filter(Boolean),
);

/** `inherit`, or a font shorthand that ends in one font token. */
const fontValue = new RegExp(`^inherit$|${fontShorthand}`, 'iu');

/** `style:property=` directives and SVG colour attributes, with a quoted or braced value. */
const binding =
  /(?:\bstyle:([a-z-]+)(?:\|important)?|(?<=\s)(fill|stroke|stop-color|flood-color|lighting-color))=(?:"([^"]*)"|'([^']*)'|\{((?:[^{}]|\$\{[^{}]*\})*)\})/giu;

/**
 * The string literals a braced expression can evaluate to, so `{dark ? 'white' : x}` is
 * checked too. A literal right after `[`, `(` or `,` is a key or argument, and one on either
 * side of `==`, `===`, `!=` or `!==` is compared, not used, so both are skipped. A template's
 * `${…}` parts become a placeholder.
 */
const stringLiterals = (expression) =>
  [...expression.matchAll(/(['"`])((?:(?!\1).)*)\1/gsu)]
    .filter(({ 0: literal, index }) => {
      const before = expression.slice(0, index);
      const after = expression.slice(index + literal.length);
      return (
        !/(?:[[(,]|[=!]==?)\s*$/u.test(before) && !/^\s*[=!]=/u.test(after)
      );
    })
    .map(([, , text]) => text.replaceAll(/\$\{[^{}]*\}/gu, 'x'));

/** The 1-based line and column of `index` in `source`. */
const position = (source, index) => {
  const before = source.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
};

/** Whether a literal value names a raw colour, for any property, or a font stack for a font property. */
const isRawValue = (property, value) => {
  const bare = value.replaceAll(/url\([^)]*\)/gu, ' ');
  if (rawColour.test(bare)) return true;
  if (fontProperties.test(property)) return !fontValue.test(value.trim());
  return bare
    .replaceAll(/var\(--[\w-]+\)|[\w-]+\(/gu, ' ')
    .split(/[\s,/()]+/u)
    .some((word) => namedColours.has(word.toLowerCase()));
};

/**
 * Svelte `style:` directives and SVG colour attributes aren't CSS, so postcss-html never shows
 * them to the other rules. This rule reads them from the component source and holds them to the
 * same contract as stylesheets: no hex, colour functions or named colours, and fonts only from
 * `var(--font-…)` tokens. Composite values, keywords, gradients over tokens and `url(…)` pass.
 * In a braced expression only the string literals are checked, since the rest isn't known
 * until runtime.
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
    const offending = values.find((value) => isRawValue(property, value));
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
