'use strict';

// Source checks read a runtime's modules joined, as if they still shared one
// closure: the export keywords the modules' declarations carry are dropped,
// so a check or an extracted function sees the code as plain declarations.
function withoutExports(source) {
  return source
    .replace(/^export \{[^}]*\};?\n?/gm, '')
    .replace(/^export (?=(?:async )?function\b|const\b|let\b|var\b|class\b)/gm, '');
}

module.exports = { withoutExports };
