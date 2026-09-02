'use strict';

const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync('src/content/pinned-recent-update-feedback.js', 'utf8');

assert.match(source, /width:\s*min\(720px,\s*calc\(100vw - 24px\)\)/);
assert.match(source, /backdrop-filter:\s*blur\(56px\) saturate\(210%\)/);
assert.match(source, /--home-card-width:\s*min\(251px,/);
assert.match(source, /\.card-stage \{[^}]*width:\s*min\(var\(--home-card-width\),\s*100%\)/s);
assert.match(source, /data-phase=\"breathing\"/);
assert.match(source, /data-phase=\"card-enter\"/);
assert.match(source, /data-phase=\"old-out\"/);
assert.match(source, /data-phase=\"new-in\"/);
assert.match(source, /data-phase=\"success\"/);
assert.match(source, /x-lumno-action-button--secondary secondary/);
assert.match(source, /x-lumno-action-button--primary primary/);
assert.match(source, /max-height:\s*calc\(100dvh - 24px\)/);
assert.match(source, /overflow-y:\s*auto/);
assert.match(source, /@media \(max-width:640px\)/);
assert.match(source, /@media \(prefers-reduced-motion:reduce\)/);
assert.doesNotMatch(source, /width:\s*min\(340px,\s*100%\)/);

console.log('pinned recent update feedback style tests passed');
