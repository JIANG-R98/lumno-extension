const assert = require('assert');
const { isLocalFileLikeUrl } = require('../../src/overlay/overlay-context.ts');

// Local files and PDFs, where the overlay leaves the tab's zoom alone.

[
  'file:///Users/me/notes.html',
  'https://example.com/report.PDF',
  'chrome-extension://viewer/index.html?src=file:///tmp/a.html',
  'chrome-extension://viewer/index.html?src=https://example.com/a.pdf',
  'chrome-extension://viewer/index.html?src=file%3A%2F%2F%2Ftmp%2Fa.html',
  // A src that is no URL still names a PDF.
  'chrome-extension://viewer/index.html?src=report.pdf',
  'file://'
].forEach((url) => {
  assert.strictEqual(isLocalFileLikeUrl(url), true, url);
});

[
  '',
  'https://example.com/',
  'https://example.com/docs?src=https://example.com/page',
  'chrome-extension://viewer/index.html?src=not-a-file',
  'not a url at all'
].forEach((url) => {
  assert.strictEqual(isLocalFileLikeUrl(url), false, url || '(empty)');
});

console.log('overlay context tests passed');
