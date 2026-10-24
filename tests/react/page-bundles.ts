import { createRequire } from 'node:module';

// Runs a bundle from scripts/build/bundles.js the way the page runs it: its
// files in order, as modules. Call vi.resetModules() before a page's first
// bundle so each boot gets fresh module instances; the page's later bundles
// then share them, as bundles with sharedFrom do.
const require = createRequire(import.meta.url);
const { BUNDLES } = require('../../scripts/build/bundles.js') as {
  BUNDLES: Array<{ name: string; files: string[] }>;
};

export async function runPageBundle(name: string): Promise<void> {
  const bundle = BUNDLES.find((candidate) => candidate.name === name);
  if (!bundle) {
    throw new Error(`No bundle named ${name} in scripts/build/bundles.js`);
  }
  for (const file of bundle.files) {
    await import(/* @vite-ignore */ `../../${file}`);
  }
}
