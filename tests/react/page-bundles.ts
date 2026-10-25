import { createRequire } from 'node:module';

// Runs a bundle from scripts/build/bundles.js the way the page runs it: its
// files in order, as modules. Call vi.resetModules() before a page's first
// bundle so each boot gets fresh module instances; the page's later bundles
// then share them, as bundles with sharedFrom do.
const require = createRequire(import.meta.url);

interface Bundle {
  name: string;
  files: string[];
}

function isBundle(value: unknown): value is Bundle {
  return typeof value === 'object' && value !== null &&
    'name' in value && typeof value.name === 'string' &&
    'files' in value && Array.isArray(value.files) && value.files.every((file) => typeof file === 'string');
}

function readBundles(moduleExports: unknown): Bundle[] {
  const bundles = typeof moduleExports === 'object' && moduleExports !== null && 'BUNDLES' in moduleExports
    ? moduleExports.BUNDLES
    : null;
  if (!Array.isArray(bundles) || !bundles.every(isBundle)) {
    throw new Error('scripts/build/bundles.js exports no BUNDLES list.');
  }
  return bundles;
}

const BUNDLES = readBundles(require('../../scripts/build/bundles.js'));

export async function runPageBundle(name: string): Promise<void> {
  const bundle = BUNDLES.find((candidate) => candidate.name === name);
  if (!bundle) {
    throw new Error(`No bundle named ${name} in scripts/build/bundles.js`);
  }
  for (const file of bundle.files) {
    await import(/* @vite-ignore */ `../../${file}`);
  }
}
