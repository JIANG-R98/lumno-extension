'use strict';

// Builds the development extension into dist/chrome/ and keeps it current:
// copied files, the React islands and the bundles each rebuild as their
// sources change. Reload the extension in chrome://extensions after a change
// to the worker or the manifest; reload pages for everything else.
//   npm run watch

const path = require('path');
const { spawn } = require('child_process');
const { buildStatic } = require('./build-static');

const repoRoot = path.resolve(__dirname, '..', '..');
const children = [];

function run(args) {
  const child = spawn(process.execPath, args, { cwd: repoRoot, stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code) => {
    if (code) {
      console.error(`${args.join(' ')} exited with ${code}`);
      process.exitCode = code;
    }
  });
}

async function main() {
  buildStatic();
  const { build } = await import('vite');
  // Both configs write to src/react/; neither may empty it on a rebuild.
  for (const config of ['vite.config.mjs', 'vite.overlay.config.mjs']) {
    await build({
      configFile: path.join(repoRoot, config),
      build: { emptyOutDir: false, watch: {} },
      logLevel: 'warn'
    });
  }
  run([path.join(__dirname, 'build-static.js'), '--watch']);
  run([path.join(__dirname, 'build-bundles.js'), '--watch']);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    children.forEach((child) => child.kill(signal));
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
