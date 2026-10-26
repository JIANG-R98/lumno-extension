// The traditional-to-simplified table search folds Han characters with
// (han-variants.generated.ts): pairs of characters, each traditional one
// followed by the simplified one it reads as. The worker installs it at
// start; pages load it on first use, since most of them never need it, and
// install what the loaded module exports.

let installedPairs: string | null = null;

// Installs the table once; later calls keep the first one.
function installHanVariantPairs(pairs: string): void {
  if (!installedPairs && pairs) {
    installedPairs = pairs;
  }
}

// The installed table, or null before it arrives.
function getHanVariantPairs(): string | null {
  return installedPairs;
}

// The table a loaded copy of han-variants.generated.ts exports, or null when
// the value is not one.
function readHanVariantModule(loaded: unknown): string | null {
  if (!loaded || typeof loaded !== 'object') {
    return null;
  }
  const pairs: unknown = Reflect.get(loaded, 'HAN_VARIANT_PAIRS');
  return typeof pairs === 'string' && pairs.length > 0 && pairs.length % 2 === 0 ? pairs : null;
}

export { getHanVariantPairs, installHanVariantPairs, readHanVariantModule };
