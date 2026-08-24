const assert = require('assert');

const policy = require('../src/background/command-target-policy.js');

assert.strictEqual(typeof policy.shouldSuppressRestrictedCommandFallback, 'function');
assert.strictEqual(typeof policy.shouldTriggerOnboardingOverlayFromCommand, 'function');
assert.strictEqual(
  policy.ONBOARDING_SEARCH_OVERLAY_COMMAND_ACTION,
  'triggerOnboardingSearchOverlayFromCommand',
  'background and onboarding should share a stable action name for command-triggered overlay open'
);

const onboardingUrl = 'chrome-extension://abc/src/onboarding/onboarding.html?entry=ext';
const newtabUrl = 'chrome-extension://abc/newtab.html?focus=1';
const pageUrl = 'https://example.com/';

function optionsFor(url) {
  return {
    isOwnExtensionUrl: (candidate) => String(candidate || '').startsWith('chrome-extension://abc/'),
    isOnboardingUrl: (candidate) => String(candidate || '').startsWith('chrome-extension://abc/src/onboarding/onboarding.html')
  };
}

assert.strictEqual(
  policy.shouldSuppressRestrictedCommandFallback('commands', onboardingUrl, optionsFor(onboardingUrl)),
  true,
  'show-search commands on the onboarding extension page should not fall through to newtab fallback'
);
assert.strictEqual(
  policy.shouldTriggerOnboardingOverlayFromCommand('commands', onboardingUrl, optionsFor(onboardingUrl)),
  true,
  'show-search commands on the onboarding extension page should be forwarded back to the onboarding UI'
);

assert.strictEqual(
  policy.shouldSuppressRestrictedCommandFallback('commands-prefill', onboardingUrl, optionsFor(onboardingUrl)),
  true,
  'show-search prefill commands on the onboarding extension page should not fall through to newtab fallback'
);

assert.strictEqual(
  policy.shouldSuppressRestrictedCommandFallback('page-hotkey', onboardingUrl, optionsFor(onboardingUrl)),
  false,
  'page-hotkey sources should keep the existing restricted URL handling'
);

assert.strictEqual(
  policy.shouldSuppressRestrictedCommandFallback('commands', newtabUrl, optionsFor(newtabUrl)),
  false,
  'newtab command handling should continue through the existing focus-input path'
);

assert.strictEqual(
  policy.shouldSuppressRestrictedCommandFallback('commands', pageUrl, optionsFor(pageUrl)),
  false,
  'regular web pages should never be suppressed by the onboarding-only policy'
);

console.log('background command target policy tests passed');
