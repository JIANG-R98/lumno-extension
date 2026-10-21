const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
// React views split into a folder of parts beside their entry module. Source
// checks written against the single file read the parts and then the entry.
const SPLIT_REACT_VIEWS = {
  'react-src/search/suggestions.tsx': 'react-src/search/suggestion-list'
};

function readReactSource(relativePath) {
  const dir = SPLIT_REACT_VIEWS[relativePath];
  const parts = dir
    ? fs.readdirSync(path.join(repoRoot, dir)).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)).sort()
      .map((f) => `${dir}/${f}`)
    : [];
  return parts.concat(relativePath).map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8')).join('\n');
}

module.exports = { SPLIT_REACT_VIEWS, readReactSource };
