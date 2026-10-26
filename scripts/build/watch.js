'use strict';

// Builds the development extension into dist/chrome/ and keeps it current:
// copied files and the built entries each rebuild as their sources change.
// Reload the extension in chrome://extensions after a change to the worker or
// the manifest; reload pages for everything else.
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

buildStatic();
run([path.join(__dirname, 'build-static.js'), '--watch']);
run([path.join(__dirname, 'build.js'), '--watch']);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    children.forEach((child) => child.kill(signal));
    process.exit(0);
  });
}
