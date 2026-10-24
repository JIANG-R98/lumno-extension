// @ts-nocheck
function getInteractiveProviders(providers, isInteractive) {
  const predicate = typeof isInteractive === 'function'
    ? isInteractive
    : () => true;
  return (Array.isArray(providers) ? providers : []).filter(predicate);
}

function findProvider(providers, key) {
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (!normalizedKey) {
    return null;
  }
  return providers.find((provider) => (
    String(provider && provider.key || '').trim().toLowerCase() === normalizedKey
  )) || null;
}

function resolveSelectionQuickActionProvider(
  visibleProviders,
  bundledProviders,
  requestedKey,
  isInteractive
) {
  const visible = getInteractiveProviders(visibleProviders, isInteractive);
  const bundled = getInteractiveProviders(bundledProviders, isInteractive);
  return findProvider(visible, requestedKey) ||
    findProvider(bundled, requestedKey) ||
    findProvider(visible, 'gpt') ||
    findProvider(bundled, 'gpt') ||
    visible[0] ||
    bundled[0] ||
    null;
}

export { resolveSelectionQuickActionProvider };
