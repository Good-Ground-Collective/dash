import path from 'node:path';

import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

import config from '../stylelint.config.js';

class Lint {
  /** The warnings for a source, linted as if it lived at `file`. */
  static async warnings(props) {
    const { results } = await stylelint.lint({
      code: props.code,
      codeFilename: path.join(process.cwd(), 'src', props.file),
      config,
    });
    return results.flatMap((result) => result.warnings);
  }

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
    [
      'a literal family beside a token in the font shorthand',
      'a { font: 1rem Inter, var(--font-body); }',
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
      '  font-family: var(--font-h1);',
      '}',
      '',
      'b {',
      '  font: 600 1rem/1.2 var(--font-body);',
      '}',
      '',
      'button {',
      '  font: inherit;',
      '}',
    ].join('\n');

    expect(await Lint.rules({ file: 'lib/thing.css', code })).toEqual([]);
  });

  it('exempts theme files', async () => {
    const code =
      'a { --ink: #1b1a18; --paper: white; --hue: oklch(70% 0.1 30deg); --font-body: "Geist", sans-serif; }';

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
    [
      'a named colour in a ternary',
      "<p style:color={dark ? 'white' : 'var(--ink)'}>x</p>",
    ],
    [
      'a raw colour in a ternary branch after a comparison',
      "<p style:color={hue === 'teal' ? '#0aa' : 'var(--ink)'}>x</p>",
    ],
    [
      'a named colour in a border shorthand',
      '<p style:border-top="1px solid white">x</p>',
    ],
    ['a named colour in a custom property', '<p style:--accent="red">x</p>'],
    [
      'a named colour in a column rule',
      '<p style:column-rule="1px solid red">x</p>',
    ],
  ])('rejects %s in a style directive', async (_label, code) => {
    expect(await Lint.rules({ file: 'lib/Thing.svelte', code })).toEqual([
      'dash/style-directive-tokens',
    ]);
  });

  it.each([
    ['a radius', '<p style:border-radius="4px">x</p>'],
    ['a border width', '<p style:border-width="1px">x</p>'],
    ['a composite border', '<p style:border="1px solid var(--line)">x</p>'],
    ['none', '<p style:outline="none">x</p>'],
    ['lowercase currentcolor', '<p style:border-color="currentcolor">x</p>'],
    [
      'background keywords',
      '<p style:background="var(--bg) no-repeat center">x</p>',
    ],
    [
      'a gradient over tokens',
      '<p style:background="linear-gradient(var(--a), var(--b))">x</p>',
    ],
    ['an SVG url fill', '<path fill="url(#grad)" />'],
    ['an SVG url fill with a hex-like id', '<path fill="url(#fade)" />'],
    ['a string used as a lookup key', "<p style:color={palette['teal']}>x</p>"],
    [
      'colour names compared in a ternary',
      "<p style:color={hue === 'teal' ? 'var(--a)' : 'red' !== tone ? 'var(--b)' : 'var(--c)'}>x</p>",
    ],
    [
      'an SVG stroke of currentColor',
      '<path stroke="currentColor" fill="none" />',
    ],
  ])('allows %s', async (_label, code) => {
    expect(await Lint.rules({ file: 'lib/Thing.svelte', code })).toEqual([]);
  });

  it('rejects a hex SVG fill', async () => {
    expect(
      await Lint.rules({
        file: 'lib/Thing.svelte',
        code: '<path fill="#fff" />',
      }),
    ).toEqual(['dash/style-directive-tokens']);
  });

  it('reports a directive once in a component with several stylesheets', async () => {
    const code = [
      '<p style="margin: 0" style:color="white">x</p>',
      '<style>',
      '  p {',
      '    color: var(--ink);',
      '  }',
      '</style>',
      '',
    ].join('\n');

    expect(await Lint.rules({ file: 'lib/Thing.svelte', code })).toEqual([
      'dash/style-directive-tokens',
    ]);
  });

  it('reports a directive on its own line, below other stylesheets', async () => {
    const code = [
      '<style>',
      '  p {',
      '    color: var(--ink);',
      '  }',
      '</style>',
      '<p style="margin: 0">x</p>',
      '<p style:color="white">y</p>',
      '',
    ].join('\n');

    const warnings = await Lint.warnings({ file: 'lib/Thing.svelte', code });

    expect(warnings).toMatchObject([
      { rule: 'dash/style-directive-tokens', line: 7, column: 4 },
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
