'use strict';

// The build step of module-script.js for module stubs, which need an esbuild
// plugin and so an asynchronous build: run as a child process, it prints the
// script. Arguments: one JSON object { entry, globalName, stubs }.

const path = require('path');
const esbuild = require('esbuild');
const { resolveSourceFile } = require('../../scripts/node/register-typescript');

const repoRoot = path.resolve(__dirname, '..', '..');
const { entry, globalName, stubs } = JSON.parse(process.argv[2]);
const stubbed = new Map(Object.entries(stubs).map(([file, name]) => [resolveSourceFile(file) || path.join(repoRoot, file), name]));

esbuild.build({
  absWorkingDir: repoRoot,
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  globalName,
  target: ['chrome110', 'firefox140'],
  charset: 'utf8',
  write: false,
  logLevel: 'silent',
  plugins: [{
    name: 'lumno-test-stubs',
    setup(build) {
      // A namespace of their own keeps src/package.json's "type": "module"
      // from making the stubs ES modules, so they can use module.exports.
      build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
        const file = resolveSourceFile(path.resolve(args.resolveDir, args.path));
        return file && stubbed.has(file) ? { path: file, namespace: 'lumno-test-stub' } : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: 'lumno-test-stub' }, (args) => ({
        contents: `module.exports = globalThis[${JSON.stringify(stubbed.get(args.path))}];`,
        loader: 'js'
      }));
    }
  }]
}).then((result) => {
  process.stdout.write(result.outputFiles[0].text);
}).catch((error) => {
  process.stderr.write(String(error && error.message || error));
  process.exit(1);
});
