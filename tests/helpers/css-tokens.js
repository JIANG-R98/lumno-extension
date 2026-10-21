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

// Page stylesheets that are split into parts the page links in order. Checks
// written against the single file read the parts joined, in that order.
const SPLIT_STYLESHEETS = {
  'src/newtab/newtab.css': [
    'page', 'shortcuts', 'top-content', 'dock-and-entry', 'sections', 'bookmarks-topbar',
    'bookmark-cascade', 'recent-cards', 'notices-and-suggestions', 'corner-controls',
    'wallpaper-ink', 'appearance-panel', 'appearance-options', 'suggestions', 'page-overrides'
  ].map((name) => `src/newtab/styles/${name}.css`),
  'src/onboarding/onboarding.css': [
    'shell', 'page-copy', 'interactions', 'dark-theme', 'responsive', 'visual-stage',
    'newtab-preview', 'newtab-preview-sections', 'site-search-demo', 'feature-cards',
    'browser-window', 'overlay-demo', 'cursor-layer'
  ].map((name) => `src/onboarding/styles/${name}.css`)
};

// A stylesheet's source as written, joining a split stylesheet's parts.
function readStylesheetSource(relativePath) {
  const parts = SPLIT_STYLESHEETS[relativePath] || [relativePath];
  return parts.map((part) => fs.readFileSync(path.join(repoRoot, part), 'utf8')).join('\n');
}

function readStylesheet(relativePath) {
  return resolveLumnoTokens(readStylesheetSource(relativePath));
}

module.exports = { SPLIT_STYLESHEETS, readLightTokens, readStylesheet, readStylesheetSource, resolveLumnoTokens };
