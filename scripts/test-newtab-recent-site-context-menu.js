const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const newtabJs = fs.readFileSync(
  path.join(repoRoot, 'src', 'newtab', 'newtab.js'),
  'utf8'
);
const newtabHtml = fs.readFileSync(
  path.join(repoRoot, 'newtab.html'),
  'utf8'
);
const recentSitesReact = fs.readFileSync(
  path.join(repoRoot, 'react-src', 'newtab', 'recent-sites.tsx'),
  'utf8'
);
const onboardingPreviewReact = fs.readFileSync(
  path.join(repoRoot, 'react-src', 'onboarding', 'newtab-preview.tsx'),
  'utf8'
);
const onboardingHtml = fs.readFileSync(
  path.join(repoRoot, 'src', 'onboarding', 'onboarding.html'),
  'utf8'
);

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
    newtabJs.includes("RECENT_CONTEXT_MENU_UNDO_UPDATE_VALUE = 'undo-tracking-update'") &&
    newtabJs.includes("action: NEWTAB_CONTEXT_MENU_OPEN_VALUE") &&
    newtabJs.includes('openRecentSiteInNewTab(target.item)') &&
    newtabJs.includes("trackingCardId: isRecentSiteTracked(item)") &&
    newtabJs.includes('dividerBefore: true') &&
    newtabJs.includes('function handleRecentContextMenuAction(actionValue)') &&
    newtabJs.includes('removeRecentSiteFromContextMenu(target.item)') &&
    newtabJs.includes('undoRecentSiteUpdateFromContextMenu(target.item)') &&
    newtabJs.includes("confirmationTitle: t('recent_undo_tracking_update_confirm_title'") &&
    newtabJs.includes('async onConfirm()') &&
    newtabJs.includes('hideRecentSiteTemporarily(item)'),
  'the recent-site record should change only after the remove menu action is selected'
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
      messages.recent_undo_tracking_update &&
      messages.recent_undo_tracking_update_confirm_title &&
      messages.recent_undo_tracking_update_confirm_description &&
      messages.recent_undo_tracking_update_confirm &&
      messages.recent_undo_tracking_update_success &&
      String(messages.newtab_open_in_new_tab.message || '').trim() &&
      String(messages.recent_context_menu_label.message || '').trim(),
    `${locale} should localize the recent-site context-menu label`
  );
});

console.log('New Tab recent-site context-menu tests passed.');
