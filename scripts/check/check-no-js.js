'use strict';

// Fails when a JavaScript file appears in src/, or when a tsconfig turns on
// allowJs or checkJs: every module there is TypeScript, the compiler does not
// accept JavaScript, and the build only bundles .ts and .tsx sources.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const CHECKED_DIRECTORIES = ['src'];
const JAVASCRIPT_FILE = /\.(?:js|mjs|cjs|jsx)$/;

function findJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findJavaScriptFiles(filePath);
    }
    return entry.isFile() && JAVASCRIPT_FILE.test(entry.name) ? [path.relative(repoRoot, filePath)] : [];
  });
}

const permissiveConfigs = fs.readdirSync(repoRoot)
  .filter((file) => /^tsconfig(?:\.[\w-]+)?\.json$/.test(file))
  .filter((file) => {
    const options = JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8')).compilerOptions || {};
    return 'allowJs' in options || 'checkJs' in options;
  });
if (permissiveConfigs.length > 0) {
  console.error(`allowJs and checkJs are not allowed: ${permissiveConfigs.join(', ')}`);
  process.exit(1);
}

const found = CHECKED_DIRECTORIES.flatMap((directory) => findJavaScriptFiles(path.join(repoRoot, directory)));
if (found.length > 0) {
  console.error('JavaScript files are not allowed here; write them in TypeScript:');
  found.forEach((file) => console.error(`  ${file}`));
  process.exit(1);
}
console.log(`No JavaScript files in ${CHECKED_DIRECTORIES.join(', ')}.`);
