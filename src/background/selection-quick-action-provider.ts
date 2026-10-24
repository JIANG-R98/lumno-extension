// Which AI provider a selection quick action opens.

interface ProviderLike {
  key?: string;
}

function getInteractiveProviders<P extends ProviderLike>(
  providers: readonly P[] | null | undefined,
  isInteractive: ((provider: P) => boolean) | null | undefined
): P[] {
  const predicate = typeof isInteractive === 'function'
    ? isInteractive
    : () => true;
  return (Array.isArray(providers) ? providers : []).filter(predicate);
}

function findProvider<P extends ProviderLike>(providers: readonly P[], key: unknown): P | null {
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (!normalizedKey) {
    return null;
  }
  return providers.find((provider) => (
    String(provider && provider.key || '').trim().toLowerCase() === normalizedKey
  )) || null;
}

// The provider the selection toolbar asks: the requested one, else ChatGPT,
// else the first interactive provider, preferring the person's own list.
function resolveSelectionQuickActionProvider<P extends ProviderLike>(
  visibleProviders: readonly P[] | null | undefined,
  bundledProviders: readonly P[] | null | undefined,
  requestedKey: unknown,
  isInteractive?: ((provider: P) => boolean) | null
): P | null {
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
