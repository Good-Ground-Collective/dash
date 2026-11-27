import { fileURLToPath } from 'node:url';

import styleDirectives from './stylelint-style-directives.js';
import {
  colourFunctions,
  fontShorthand,
  fontToken,
} from './stylelint-tokens.js';

/** A component names a token, never a literal stack. */
const fontFamilyValues = [`/^${fontToken}$/`, 'inherit'];

export default {
  extends: [fileURLToPath(import.meta.resolve('stylelint-config-standard'))],
  plugins: [styleDirectives],
  rules: {
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': colourFunctions,
    'declaration-property-value-allowed-list': {
      'font-family': fontFamilyValues,
      font: ['inherit', `/${fontShorthand}/`],
    },
    'dash/style-directive-tokens': true,
  },
  overrides: [
    {
      files: ['**/*.svelte'],
      customSyntax: fileURLToPath(
        import.meta.resolve('./stylelint-svelte-syntax.js'),
      ),
      rules: {
        'no-empty-source': null,
        'no-descending-specificity': null,
        'selector-pseudo-class-no-unknown': [
          true,
          { ignorePseudoClasses: ['global'] },
        ],
      },
    },
    {
      files: ['**/theme/themes/**/*.css'],
      rules: {
        'color-no-hex': null,
        'color-named': null,
        'function-disallowed-list': null,
        'declaration-property-value-allowed-list': null,
      },
    },
  ],
};
