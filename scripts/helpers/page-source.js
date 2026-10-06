const fs = require('fs');
const path = require('path');
const { resolveLumnoTokens } = require('./css-tokens');

const repoRoot = path.resolve(__dirname, '..', '..');
const PAGE_STYLESHEETS = {
  'newtab.html': 'src/newtab/newtab.css',
  'src/options/options.html': 'src/options/options.css',
  'src/onboarding/onboarding.html': 'src/onboarding/onboarding.css'
};

// Returns a page's HTML with its own stylesheet inlined where it is linked, so
// source checks can see the markup and the page styles in document order.
function readPageSource(relativePath) {
  const normalized = path.relative(repoRoot, path.resolve(repoRoot, relativePath)).split(path.sep).join('/');
  const html = fs.readFileSync(path.join(repoRoot, normalized), 'utf8');
  const stylesheet = PAGE_STYLESHEETS[normalized];
  if (!stylesheet) {
    return html;
  }
  const href = path.basename(stylesheet);
  const css = resolveLumnoTokens(fs.readFileSync(path.join(repoRoot, stylesheet), 'utf8')).replace(/\n$/, '');
  return html.replace(
    new RegExp(`^([ \\t]*)<link rel="stylesheet" href="${href.replace('.', '\\.')}" />$`, 'm'),
    (_match, indent) => [
      `${indent}<style>`,
      ...css.split('\n').map((line) => (line ? `${indent}  ${line}` : line)),
      `${indent}</style>`
    ].join('\n')
  );
}

module.exports = { readPageSource };
