const assert = require('assert');
const fs = require('fs');
const path = require('path');

// scripts/node/register-typescript.js, which run-tests.js preloads into every
// test file: TypeScript sources load through require and import, .js and
// extensionless specifiers find them, and reading one as text gives plain
// JavaScript at the same positions.

const repoRoot = path.resolve(__dirname, '..', '..');
const directory = path.join(repoRoot, '.tmp', `typescript-hooks-${process.pid}`);
fs.mkdirSync(directory, { recursive: true });

const typedSource = [
  'type Greeting = { text: string };',
  'export function greet(name: string): Greeting {',
  '  return { text: `hello ${name}` };',
  '}',
  ''
].join('\n');

try {
  fs.writeFileSync(path.join(directory, 'greet.ts'), typedSource);
  fs.writeFileSync(path.join(directory, 'by-js-path.js'), "export { greet } from './greet.js';\n");
  fs.writeFileSync(path.join(directory, 'extensionless.ts'), "export { greet } from './greet';\n");

  assert.deepStrictEqual(require(path.join(directory, 'greet.ts')).greet('ts'), { text: 'hello ts' },
    'require should run a .ts file');
  assert.deepStrictEqual(require(path.join(directory, 'by-js-path.js')).greet('js'), { text: 'hello js' },
    'an import of a .js path should find the .ts file');
  assert.deepStrictEqual(require(path.join(directory, 'extensionless.ts')).greet('bare'), { text: 'hello bare' },
    'an extensionless import should find the .ts file');
  assert.deepStrictEqual(require(path.join(directory, 'greet.js')).greet('require'), { text: 'hello require' },
    'require of a .js path should find the .ts file');

  const text = fs.readFileSync(path.join(directory, 'greet.js'), 'utf8');
  assert.doesNotMatch(text, /: string|type Greeting/, 'reading a source as text should drop its types');
  assert.strictEqual(text.length, typedSource.length, 'type stripping should keep every position');
  assert.strictEqual(text.split('\n')[2], typedSource.split('\n')[2], 'untyped lines should read unchanged');
  assert.strictEqual(fs.readFileSync(path.join(directory, 'greet.ts')).toString(), typedSource,
    'a binary read should return the file as it is');

  assert.throws(() => require(path.join(directory, 'missing.js')), /Cannot find module/,
    'a path with no .js or .ts file should still fail');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('TypeScript hook tests passed.');
