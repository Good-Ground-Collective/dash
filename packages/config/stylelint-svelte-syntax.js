import postcss from 'postcss';
import postcssHtml from 'postcss-html';

const html = postcssHtml();

/**
 * postcss-html, plus an empty stylesheet for a component with no `<style>` block or `style`
 * attribute. Stylelint runs rules once per stylesheet, so without it a component made only of
 * `style:` directives would never be checked.
 */
export default {
  parse(css, options) {
    const document = html.parse(css, options);
    if (document.nodes.length === 0) {
      const root = postcss.root();
      root.source = {
        input: document.source.input,
        start: { line: 1, column: 1, offset: 0 },
      };
      root.raws.codeBefore = css;
      root.parent = document;
      root.document = document;
      document.nodes.push(root);
    }
    return document;
  },
  stringify: html.stringify,
};
