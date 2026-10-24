// Where the search command goes when the active tab is Lumno's onboarding
// page: its own search overlay instead of the restricted-page fallback.

interface CommandTargetOptions {
  isOwnExtensionUrl?: (url: string) => boolean;
  isOnboardingUrl?: (url: string) => boolean;
}

const ONBOARDING_SEARCH_OVERLAY_COMMAND_ACTION = 'triggerOnboardingSearchOverlayFromCommand';

function isSearchCommandSource(source: unknown): boolean {
  return source === 'commands' || source === 'commands-prefill';
}

function shouldTriggerOnboardingOverlayFromCommand(
  source: unknown,
  url: string | null | undefined,
  options?: CommandTargetOptions | null
): boolean {
  if (!isSearchCommandSource(source) || !url) {
    return false;
  }
  const settings = options && typeof options === 'object' ? options : {};
  const isOwnExtensionUrl = typeof settings.isOwnExtensionUrl === 'function'
    ? settings.isOwnExtensionUrl(url)
    : false;
  if (!isOwnExtensionUrl) {
    return false;
  }
  const isOnboardingUrl = typeof settings.isOnboardingUrl === 'function'
    ? settings.isOnboardingUrl(url)
    : false;
  return Boolean(isOnboardingUrl);
}

function shouldSuppressRestrictedCommandFallback(
  source: unknown,
  url: string | null | undefined,
  options?: CommandTargetOptions | null
): boolean {
  return shouldTriggerOnboardingOverlayFromCommand(source, url, options);
}

export {
  ONBOARDING_SEARCH_OVERLAY_COMMAND_ACTION,
  shouldTriggerOnboardingOverlayFromCommand,
  shouldSuppressRestrictedCommandFallback
};
export type { CommandTargetOptions };
