const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readPageSource } = require('./helpers/page-source');
const { readNewtabRuntimeSource } = require('./helpers/newtab-source');

const repoRoot = path.resolve(__dirname, '..');
const newtabJs = readNewtabRuntimeSource();
const newtabHtml = readPageSource('newtab.html');
const recentSitesReact = fs.readFileSync(
  path.join(repoRoot, 'react-src', 'newtab', 'recent-sites.tsx'),
  'utf8'
);
const onboardingPreviewReact = fs.readFileSync(
  path.join(repoRoot, 'react-src', 'onboarding', 'newtab-preview.tsx'),
  'utf8'
);
const onboardingHtml = readPageSource('src/onboarding/onboarding.html');

assert.ok(
  recentSitesReact.includes('onContextMenu={(event) => {') &&
    recentSitesReact.includes('options.onItemContextMenu({') &&
    recentSitesReact.includes('event: event.nativeEvent'),
  'recent-site cards should route right-clicks to the New Tab context-menu controller'
);
assert.ok(
  !recentSitesReact.includes('className="x-nt-recent-dismiss"') &&
    !recentSitesReact.includes('data-recent-dismiss-icon') &&
    !recentSitesReact.includes('_xDismissButton'),
  'recent-site cards should not render the old top-right remove button'
);
assert.ok(
  newtabJs.includes("className: 'x-nt-shortcut-context-menu x-nt-recent-context-menu'") &&
    newtabJs.includes("menuClassName: 'x-nt-shortcut-context-menu-portal x-nt-recent-context-menu-portal'") &&
    newtabJs.includes('onItemContextMenu: handleRecentCardContextMenu'),
  'recent-site deletion should reuse the shared New Tab context-menu surface'
);
assert.ok(
  newtabJs.includes("RECENT_CONTEXT_MENU_REMOVE_VALUE = 'remove'") &&
    newtabJs.includes("action: NEWTAB_CONTEXT_MENU_OPEN_VALUE") &&
    newtabJs.includes("openExternalNewTabUrl(target.item.url, 'newTab')") &&
    newtabJs.includes('dividerBefore: true') &&
    newtabJs.includes('function handleRecentContextMenuAction(actionValue)') &&
    newtabJs.includes('removeRecentSiteFromContextMenu(target.item)') &&
    newtabJs.includes('hideRecentSiteTemporarily(item)'),
  'the recent-site record should change only after the remove menu action is selected'
);
assert.ok(
  newtabJs.includes("RECENT_CONTEXT_MENU_ADD_SHORTCUT_VALUE = 'add-shortcut'") &&
    newtabJs.includes("t('recent_add_to_shortcuts', 'Add to shortcuts')") &&
    newtabJs.includes('hasShortcutForSite(getRecentShortcutSite(target.item))') &&
    newtabJs.includes('disabled: isShortcut') &&
    newtabJs.includes('addSiteToShortcuts(getRecentShortcutSite(target.item))') &&
    newtabJs.includes('function addSiteToShortcuts(site)') &&
    newtabJs.includes('newtabShortcuts.length >= MAX_NEWTAB_SHORTCUTS'),
  'recent-site cards should offer adding the site to shortcuts and disable it once added'
);
assert.ok(
  newtabHtml.includes('[data-recent-context-menu-open="true"]') &&
    !newtabHtml.includes('.x-nt-recent-dismiss'),
  'the context-menu target should remain visibly active without old dismiss-button styles'
);
assert.ok(
  !onboardingPreviewReact.includes('className="x-nt-recent-dismiss"') &&
    !onboardingHtml.includes('.newtab-preview-viewport .x-nt-recent-dismiss'),
  'the onboarding New Tab preview should match the button-free recent card'
);

['en', 'zh_CN', 'zh_TW', 'ja'].forEach((locale) => {
  const messages = JSON.parse(fs.readFileSync(
    path.join(repoRoot, '_locales', locale, 'messages.json'),
    'utf8'
  ));
  assert.ok(
    messages.newtab_open_in_new_tab &&
      messages.recent_context_menu_label &&
      messages.recent_add_to_shortcuts &&
      messages.newtab_shortcuts_already_added &&
      String(messages.recent_add_to_shortcuts.message || '').trim() &&
      String(messages.newtab_open_in_new_tab.message || '').trim() &&
      String(messages.recent_context_menu_label.message || '').trim(),
    `${locale} should localize the recent-site context-menu label`
  );
});

console.log('New Tab recent-site context-menu tests passed.');
