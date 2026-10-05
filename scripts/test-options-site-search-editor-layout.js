const assert = require('assert');
const fs = require('fs');
const { readPageSource } = require('./helpers/page-source');

const optionsHtml = readPageSource('src/options/options.html');

assert.match(
  optionsHtml,
  /\._x_extension_shortcut_item_2024_unique_\[data-type="custom"\]\[data-expanded="true"\]\s+\._x_extension_shortcut_editor_2024_unique_\s*\{\s*max-height:\s*560px;/,
  'expanded custom search editors should allow the same height as the full add form'
);

assert.match(
  optionsHtml,
  /\._x_extension_shortcut_form_2024_unique_\[data-expanded="true"\]\s*\{[\s\S]*?max-height:\s*560px;/,
  'expanded custom search forms should retain enough height for every field and action'
);

console.log('options site-search editor layout tests passed');
