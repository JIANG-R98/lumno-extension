const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const TOKENS_PATH = 'src/shared/tokens.css';

let lightTokens = null;

// Light-theme token values from the :root block of src/shared/tokens.css.
function readLightTokens() {
  if (lightTokens) {
    return lightTokens;
  }
  const css = fs.readFileSync(path.join(repoRoot, TOKENS_PATH), 'utf8');
  const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  lightTokens = new Map();
  if (rootBlock) {
    for (const match of rootBlock[1].matchAll(/(--lumno-[\w-]+)\s*:\s*([^;]+);/g)) {
      lightTokens.set(match[1], match[2].replace(/\s+/g, ' ').trim());
    }
  }
  return lightTokens;
}

// Source checks assert effective values (for example "160ms"), so token references
// are resolved to their light value before matching. Fallbacks resolve the same way.
function resolveLumnoTokens(css) {
  const tokens = readLightTokens();
  return String(css).replace(/var\((--lumno-[\w-]+)(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (match, name, fallback) => {
    if (tokens.has(name)) {
      return tokens.get(name);
    }
    return fallback !== undefined ? fallback.trim() : match;
  });
}

function readStylesheet(relativePath) {
  return resolveLumnoTokens(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

module.exports = { readLightTokens, readStylesheet, resolveLumnoTokens };
