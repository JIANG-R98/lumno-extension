const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Read the raw stylesheet so the shared accordion tokens stay visible.
const optionsCss = fs.readFileSync(path.join(__dirname, '..', 'src/options/options.css'), 'utf8');

// Editors size to their content, so no card can be cut off by a fixed cap.
assert.doesNotMatch(
  optionsCss,
  /\._x_extension_shortcut_(?:editor|form|form_fields)_2024_unique_[^{]*\{[^}]*max-height:/,
  'accordion editors and add forms should not clip their fields with a max-height cap'
);

// Every accordion shares one timing, taken from the WebDAV card.
assert.match(
  optionsCss,
  /\[data-expanded="true"\]\s+\._x_extension_shortcut_editor_2024_unique_\s*\{[^}]*height:\s*auto;[^}]*height var\(--lumno-accordion-open\)/,
  'expanded editors should open to their real height on the accordion timing'
);
assert.match(
  optionsCss,
  /\._x_extension_shortcut_editor_2024_unique_\s*\{[^}]*height:\s*0;[^}]*interpolate-size:\s*allow-keywords;[^}]*height var\(--lumno-accordion-close\)/,
  'collapsed editors should close on the accordion timing'
);
assert.match(
  optionsCss,
  /\[data-expanded="true"\]\s+\._x_extension_shortcut_form_fields_2024_unique_\s*\{[^}]*height:\s*auto;[^}]*height var\(--lumno-accordion-open\)/,
  'add forms should open on the same accordion timing as editors'
);

// Closed editors skip rendering, but only after their close has played out.
assert.match(
  optionsCss,
  /\._x_extension_shortcut_editor_2024_unique_\s*\{[^}]*content-visibility:\s*hidden;[^}]*content-visibility 0s linear var\(--lumno-duration-xl\) allow-discrete/,
  'closed editors should stop rendering once the close transition ends'
);
assert.match(
  optionsCss,
  /\._x_extension_shortcut_form_fields_2024_unique_\s*\{[^}]*content-visibility:\s*hidden;[^}]*content-visibility 0s linear var\(--lumno-duration-xl\) allow-discrete/,
  'closed add forms should stop rendering once the close transition ends'
);

assert.match(
  optionsCss,
  /\._x_extension_aggregate_search_sources_2026_unique_\s*\{[^}]*contain:\s*layout paint;/,
  'the aggregate source list should be isolated so the card animates without dropped frames'
);

console.log('options site-search editor layout tests passed');
