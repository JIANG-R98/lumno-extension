const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const newtabJs = fs.readFileSync(path.join(repoRoot, 'src/newtab/newtab.js'), 'utf8');
const newtabHtml = fs.readFileSync(path.join(repoRoot, 'newtab.html'), 'utf8');
const folderIconJs = fs.readFileSync(
  path.join(repoRoot, 'src/newtab/bookmark-folder-icon.js'),
  'utf8'
);
const cascadeMenuJs = fs.readFileSync(path.join(repoRoot, 'src/newtab/bookmark-cascade-menu.js'), 'utf8');
const cascadeViewReact = fs.readFileSync(
  path.join(repoRoot, 'react-src/newtab/bookmark-cascade-view.tsx'),
  'utf8'
);

function assertContains(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

function getFunctionBody(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${functionName} should exist`);
  const braceStart = source.indexOf('{', start);
  assert.ok(braceStart >= 0, `${functionName} should have a body`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }
  throw new Error(`${functionName} body should be parseable`);
}

const cascadeActiveBody = getFunctionBody(cascadeMenuJs, 'setBookmarkCascadeLevelActiveItem');

assertContains(
  cascadeViewReact,
  'getFigmaFolderSvg(',
  'the React bookmark cascade should reuse the newtab bookmark folder SVG'
);
assertContains(
  folderIconJs,
  'function getFigmaFolderSvg(',
  'the shared bookmark folder component should own the folder SVG implementation'
);
assertContains(
  cascadeMenuJs,
  'initFolderPathMorph(icon);',
  'the cascade behavior adapter should initialize the same folder morph behavior'
);
assert.ok(
  !cascadeViewReact.includes("getRiSvg('ri-folder"),
  'React bookmark cascade folder items should not use the Remix folder glyph'
);
assertContains(
  cascadeActiveBody,
  'playFolderPathMorph(icon, active);',
  'bookmark cascade menu item hover/active state should drive the folder SVG morph'
);
assertContains(
  cascadeViewReact,
  "'ri-arrow-right-s-line'",
  'React bookmark cascade disclosure arrows should continue to use Remix Icon'
);

assertContains(
  newtabHtml,
  '.x-nt-bookmark-cascade-icon--folder svg',
  'bookmark cascade folder SVGs should be sized by page CSS'
);
assertContains(
  newtabHtml,
  '.x-nt-bookmark-cascade-icon--folder .x-nt-folder-shape--hover',
  'bookmark cascade folder SVG hover layer should start hidden like bookmark cards'
);
assert.ok(
  /\.x-nt-bookmark-cascade-icon\s*\{[\s\S]*?border-radius:\s*4px;[\s\S]*?\}/.test(newtabHtml),
  'bookmark cascade favicon corners should stay compact'
);
assert.ok(
  !/\.x-nt-bookmark-cascade-item(?:(?!\}).)*translateY/s.test(newtabHtml),
  'bookmark cascade item hover styling should not vertically translate menu rows'
);

console.log('newtab bookmark cascade icon tests passed');
