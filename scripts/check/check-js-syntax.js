const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');

const repoRoot = path.resolve(__dirname, '..', '..');
const sourceRoot = path.join(repoRoot, 'src');
const excludedDirectories = new Set(['react', 'vendor']);

const TYPESCRIPT_LOADERS = { '.ts': 'ts', '.tsx': 'tsx' };

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return excludedDirectories.has(entry.name)
          ? []
          : collectSourceFiles(filePath);
      }
      return entry.isFile() && /\.(?:js|ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')
        ? [filePath]
        : [];
    });
}

// TypeScript sources are parsed by esbuild, which builds them; node --check
// reads JavaScript only.
function checkTypeScriptSyntax(file) {
  try {
    esbuild.transformSync(fs.readFileSync(file, 'utf8'), {
      loader: TYPESCRIPT_LOADERS[path.extname(file)],
      sourcefile: path.relative(repoRoot, file),
      logLevel: 'silent'
    });
    return null;
  } catch (error) {
    return `${error.message}\n`;
  }
}

const files = collectSourceFiles(sourceRoot).sort();
for (const file of files) {
  if (TYPESCRIPT_LOADERS[path.extname(file)]) {
    const problem = checkTypeScriptSyntax(file);
    if (problem) {
      process.stderr.write(problem);
      process.exit(1);
    }
    continue;
  }
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || '');
    process.exit(result.status || 1);
  }
}

console.log(`Source syntax checks passed (${files.length} files).`);
