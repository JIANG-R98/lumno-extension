const assert = require('assert');
const fs = require('fs');
const { readPageSource } = require('./helpers/page-source');

const optionsHtml = readPageSource('src/options/options.html');
const optionsSource = fs.readFileSync('src/options/options.js', 'utf8');

assert.match(
  optionsHtml,
  /id="_x_extension_toast_2024_unique_"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
  'the Options toast should expose a polite atomic live region before React mounts'
);
assert.match(
  optionsSource,
  /function setToastAnnouncement\(errorToast\)[\s\S]*?setAttribute\('role', errorToast \? 'alert' : 'status'\)[\s\S]*?setAttribute\('aria-live', errorToast \? 'assertive' : 'polite'\)[\s\S]*?setAttribute\('aria-atomic', 'true'\)/,
  'Options should announce errors assertively and normal status updates politely'
);
assert.match(
  optionsSource,
  /function showToast\(message, isError\)[\s\S]*?setToastAnnouncement\(errorToast\)[\s\S]*?function beginToast\(message\)[\s\S]*?fail\(result\) \{\s*setToastAnnouncement\(true\)/,
  'Options result Toasts, including a loading task that fails, should announce through the same live region rules'
);
const switchCss = fs.readFileSync('src/shared/switch.css', 'utf8');
assert.match(
  optionsHtml,
  /href="\.\.\/shared\/switch\.css"/,
  'Options should load the shared switch'
);
assert.match(
  switchCss,
  /input:focus-visible \+ :is\(\._x_extension_switch_slider_2024_unique_, \.x-nt-wallpaper-switch-slider\)\s*\{[^}]*outline:\s*2px solid var\(--switch-focus-ring\);[^}]*outline-offset:\s*2px;/,
  'the visual switch should expose the hidden checkbox focus state'
);
assert.match(
  switchCss,
  /--switch-focus-ring:\s*var\(--lumno-color-focus-ring\);/,
  'the switch focus ring should follow the shared focus token'
);
assert.match(
  optionsHtml,
  /\._x_extension_shortcut_group_action_2024_unique_:focus-visible,[\s\S]*?\._x_extension_shortcut_edit_2024_unique_:focus-visible,[\s\S]*?\._x_extension_shortcut_remove_2024_unique_:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--input-focus-color\);/,
  'clear, edit, and remove icon buttons should have a visible keyboard focus ring'
);
assert.match(
  optionsHtml,
  /\._x_extension_popconfirm_2024_unique_\s*\{[^}]*visibility:\s*hidden;[\s\S]*?\._x_extension_popconfirm_2024_unique_\[data-open="true"\]\s*\{[^}]*visibility:\s*visible;/,
  'closed Options confirmations should remain visually and interactively hidden'
);
assert.match(
  optionsSource,
  /document\.addEventListener\('keydown',[\s\S]*?event\.key !== 'Escape'[\s\S]*?closePopconfirm\(\{ restoreFocus: true \}\)/,
  'header confirmations should close on Escape and restore trigger focus'
);

assert.doesNotMatch(
  optionsHtml,
  /_x_extension_inline_tabs_2024_unique_[^"]*"[^>]*role="tablist"/,
  'value pickers are toggle-button groups, not tab lists without panels'
);
assert.match(
  optionsHtml,
  /\._x_extension_theme_option_2024_unique_:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--input-focus-color\);/,
  'segmented options should keep a keyboard focus ring despite all: unset'
);
assert.match(
  optionsHtml,
  /\._x_extension_theme_gallery_2026_unique_ \._x_extension_theme_option_2024_unique_:focus-visible \._x_extension_theme_preview_2026_unique_\s*\{[^}]*outline:\s*2px solid var\(--input-focus-color\);/,
  'theme cards should ring their preview on keyboard focus'
);
assert.match(
  optionsHtml,
  /\._x_extension_popconfirm_2024_unique_\s*\{[^}]*right:\s*0;[^}]*transform:\s*translateY\(-6px\)/,
  'header confirmations should grow leftward from their right-edge trigger instead of overflowing the page'
);
[
  'customClearButton, customItems.length',
  'aggregateSearchClearButton, aggregateSearches.length',
  'faviconBlacklistClearButton, faviconRequestBlacklistItems.length',
  'blacklistClearButton, searchBlacklistItems.length'
].forEach((call) => {
  assert.ok(
    optionsSource.includes(`syncClearButtonAvailability(${call} > 0)`),
    `clear-all should be disabled while its list is empty: ${call}`
  );
});
assert.match(
  optionsHtml,
  /\._x_extension_shortcut_group_action_2024_unique_:disabled\s*\{[^}]*cursor:\s*not-allowed;/,
  'disabled header actions should look unavailable'
);
assert.match(
  optionsHtml,
  /\._x_extension_shortcut_editor_2024_unique_\s*\{[^}]*margin-top:\s*-12px;[^}]*padding-top:\s*0;[^}]*border-top:\s*1px dashed transparent;/,
  'a collapsed item editor should not leave extra space under the card header'
);

console.log('options accessibility tests passed');
