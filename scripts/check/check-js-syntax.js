const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const sourceRoot = path.join(repoRoot, 'src');
const excludedDirectories = new Set(['react', 'vendor']);

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return excludedDirectories.has(entry.name)
          ? []
          : collectJavaScriptFiles(filePath);
      }
      return entry.isFile() && entry.name.endsWith('.js')
        ? [filePath]
        : [];
    });
}

const files = collectJavaScriptFiles(sourceRoot).sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || '');
    process.exit(result.status || 1);
  }
}

console.log(`JavaScript syntax checks passed (${files.length} files).`);
