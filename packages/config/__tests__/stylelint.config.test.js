import path from 'node:path';

import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

import config from '../stylelint.config.js';

class Lint {
  /** The rules a source breaks, linted as if it lived at `file`. */
  static async rules(props) {
    const { results } = await stylelint.lint({
      code: props.code,
      codeFilename: path.join(process.cwd(), 'src', props.file),
      config,
    });
    return results.flatMap((result) =>
      result.warnings.map((warning) => warning.rule),
    );
  }
}

describe('stylelint config: raw colours and font stacks', () => {
  it.each([
    ['a hex colour', 'a { color: #fff; }', 'color-no-hex'],
    ['a named colour', 'a { color: white; }', 'color-named'],
    ['an rgb colour', 'a { color: rgb(0 0 0); }', 'function-disallowed-list'],
    [
      'a literal font stack',
      'a { font-family: Inter, sans-serif; }',
      'declaration-property-value-allowed-list',
    ],
  ])('rejects %s in a stylesheet', async (_label, code, rule) => {
    expect(await Lint.rules({ file: 'lib/thing.css', code })).toContain(rule);
  });

  it('allows tokens, currentColor, transparent and inherit', async () => {
    const code = [
      'a {',
      '  color: var(--ink);',
      '  background: transparent;',
      '  border-color: currentcolor;',
      '  font-family: var(--font-body);',
      '}',
      '',
      'button {',
      '  font: inherit;',
      '}',
    ].join('\n');

    expect(await Lint.rules({ file: 'lib/thing.css', code })).toEqual([]);
  });

  it('exempts theme files', async () => {
    const code = 'a { --ink: #1b1a18; --font-body: "Geist", sans-serif; }';

    expect(
      await Lint.rules({ file: 'lib/theme/themes/characters.css', code }),
    ).toEqual([]);
  });
});

describe('stylelint config: Svelte components', () => {
  it('rejects #fff in a style block', async () => {
    const code = '<p>x</p>\n<style>\n  p {\n    color: #fff;\n  }\n</style>\n';

    expect(await Lint.rules({ file: 'lib/Thing.svelte', code })).toEqual([
      'color-no-hex',
    ]);
  });

  it('rejects font-family: Inter in an inline style', async () => {
    const code = '<p style="font-family: Inter">x</p>\n';

    expect(await Lint.rules({ file: 'lib/Thing.svelte', code })).toContain(
      'declaration-property-value-allowed-list',
    );
  });

  it.each([
    ['a named colour', '<p style:color="white">x</p>'],
    ['a quoted hex in braces', "<p style:background={'#000'}>x</p>"],
    ['a literal font', '<p style:font-family="Inter">x</p>'],
  ])('rejects %s in a style directive', async (_label, code) => {
    expect(await Lint.rules({ file: 'lib/Thing.svelte', code })).toEqual([
      'dash/style-directive-tokens',
    ]);
  });

  it('allows token directives, including a hue template', async () => {
    const code = [
      '<p',
      '  style:color="var(--ink)"',
      '  style:background={`var(--char-${hue}-bg)`}',
      '  style:fill={dynamicFill}',
      '>x</p>',
    ].join('\n');

    expect(await Lint.rules({ file: 'lib/Thing.svelte', code })).toEqual([]);
  });
});
