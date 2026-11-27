import stylelint from 'stylelint';

const ruleName = 'dash/style-directive-tokens';

const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (property, value) =>
    `Use a theme token for style:${property}, not "${value}"`,
});

/** Properties whose value is a colour or a font stack, so a directive must give them a token. */
const tokenOnlyProperties =
  /^(color|background(-color)?|border(-[a-z]+)*-color|border(-[a-z]+)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration-color|font|font-family)$/u;

/** A literal colour anywhere in a value: hex, or a colour function. */
const rawColour =
  /#[\da-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/iu;

/** What a token-only directive may say. */
const allowedValue =
  /^(var\(--[\w-]+\)|currentColor|transparent|inherit|`var\(--[\w${}.-]+\)`)$/u;

/** A Svelte `style:property` directive, with its quoted or braced value. */
const directive =
  /\bstyle:([a-z-]+)(?:\|important)?=(?:"([^"]*)"|'([^']*)'|\{((?:[^{}]|\$\{[^{}]*\})*)\})/giu;

/** Strips one layer of string quotes from a braced expression, so `{'#fff'}` reads as `#fff`. */
const unquote = (value) => value.trim().replace(/^(['"])(.*)\1$/su, '$2');

/** The 1-based line and column of `index` in `source`. */
const position = (source, index) => {
  const before = source.slice(0, index).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
};

/**
 * Svelte `style:` directives aren't CSS, so postcss-html never shows them to the other rules.
 * This rule reads them from the component source and holds them to the same contract: colours
 * and font stacks come from theme tokens. A braced expression that isn't a string or template
 * literal is left alone, since its value isn't known until runtime.
 */
const rule = (enabled) => (root, result) => {
  if (!enabled) return;
  const document = root.document;
  if (document === undefined || document.first !== root) return;
  const file = root.source?.input.file ?? '';
  if (!file.endsWith('.svelte')) return;

  const source = document.source?.input.css ?? '';
  for (const match of source.matchAll(directive)) {
    const [, property = '', double, single, braced] = match;
    const literal = braced === undefined || /^\s*['"`]/u.test(braced);
    const value = unquote(double ?? single ?? braced ?? '');
    const offending =
      rawColour.test(value) ||
      (literal &&
        tokenOnlyProperties.test(property) &&
        !allowedValue.test(value));
    if (offending) {
      stylelint.utils.report({
        result,
        ruleName,
        message: messages.rejected(property, value),
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
