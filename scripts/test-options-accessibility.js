const assert = require('assert');
const fs = require('fs');

const optionsHtml = fs.readFileSync('src/options/options.html', 'utf8');
const optionsSource = fs.readFileSync('src/options/options.js', 'utf8');

assert.match(
  optionsHtml,
  /id="_x_extension_toast_2024_unique_"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
  'the Options toast should expose a polite atomic live region before React mounts'
);
assert.match(
  optionsSource,
  /function showToast\(message, isError\)[\s\S]*?setAttribute\('role', errorToast \? 'alert' : 'status'\)[\s\S]*?setAttribute\('aria-live', errorToast \? 'assertive' : 'polite'\)[\s\S]*?setAttribute\('aria-atomic', 'true'\)/,
  'Options should announce errors assertively and normal status updates politely'
);
assert.match(
  optionsHtml,
  /\._x_extension_switch_2024_unique_ input:focus-visible \+ \._x_extension_switch_slider_2024_unique_\s*\{[^}]*outline:\s*2px solid var\(--input-focus-color\);[^}]*outline-offset:\s*2px;/,
  'the visual switch should expose the hidden checkbox focus state'
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

console.log('options accessibility tests passed');
