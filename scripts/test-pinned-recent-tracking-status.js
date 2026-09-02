const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const trackingStatus = require('../src/content/pinned-recent-tracking-status.js');

const repoRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
const trackingScripts = manifest.content_scripts.find((entry) =>
  Array.isArray(entry.js) && entry.js.includes('src/content/pinned-recent-tracking-token.js')
);
assert.ok(trackingScripts);
assert.deepStrictEqual(trackingScripts.js, [
  'src/content/pinned-recent-tracking-status.js',
  'src/content/pinned-recent-tracking-token.js'
]);
['en', 'zh_CN', 'zh_TW', 'ja'].forEach((locale) => {
  const messages = JSON.parse(fs.readFileSync(
    path.join(repoRoot, '_locales', locale, 'messages.json'),
    'utf8'
  ));
  [
    'recent_tracking_page_badge_title',
    'recent_tracking_page_badge_detail',
    'recent_tracking_page_badge_collapse',
    'recent_tracking_page_badge_expand'
  ].forEach((key) => assert.ok(messages[key] && messages[key].message));
});

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://www.bilibili.com/video/BV-course/?p=2'
});
const messages = {
  recent_tracking_page_badge_title: 'Tracking this tab',
  recent_tracking_page_badge_detail: 'Current page can update the pinned card',
  recent_tracking_page_badge_collapse: 'Collapse to the side',
  recent_tracking_page_badge_expand: 'Keep expanded'
};
const chromeApi = {
  i18n: {
    getMessage(key) {
      return messages[key] || '';
    }
  },
  runtime: {
    getURL(path) {
      return `chrome-extension://lumno/${path}`;
    }
  }
};

const controller = trackingStatus.createTrackingStatusController({
  windowObj: dom.window,
  chromeApi
});

assert.strictEqual(controller.show({ cardId: 'pinned-course' }), true);
const host = dom.window.document.getElementById(trackingStatus.HOST_ID);
assert.ok(host && host.shadowRoot);
const badge = host.shadowRoot.querySelector('[data-tracking-status-badge]');
const toggle = host.shadowRoot.querySelector('[data-tracking-status-toggle]');
assert.strictEqual(badge.hidden, false);
assert.strictEqual(badge.dataset.collapsed, 'false');
assert.strictEqual(badge.hasAttribute('role'), false);
assert.strictEqual(badge.querySelector('.copy').getAttribute('role'), 'status');
assert.strictEqual(toggle.closest('[role="status"]'), null);
assert.strictEqual(badge.querySelector('.title').textContent, messages.recent_tracking_page_badge_title);
assert.strictEqual(badge.querySelector('.detail').textContent, messages.recent_tracking_page_badge_detail);
assert.strictEqual(toggle.getAttribute('aria-label'), messages.recent_tracking_page_badge_collapse);
assert.ok(badge.querySelector('.brand-mark'));
assert.ok(badge.querySelector('.tracking-mark'));

controller.show({ cardId: 'pinned-course', cardTitle: 'Course · Episode 1' });
assert.strictEqual(badge.querySelector('.detail').textContent, 'Course · Episode 1');

toggle.click();
assert.strictEqual(badge.dataset.collapsed, 'true');
assert.strictEqual(toggle.getAttribute('aria-expanded'), 'false');
assert.strictEqual(toggle.getAttribute('aria-label'), messages.recent_tracking_page_badge_expand);
const styles = host.shadowRoot.querySelector('style').textContent;
assert.ok(styles.includes('.badge[data-collapsed="true"]:hover'));
assert.ok(styles.includes('@media (prefers-reduced-motion: reduce)'));

toggle.click();
assert.strictEqual(badge.dataset.collapsed, 'false');
controller.hide();
assert.strictEqual(badge.hidden, true);

dom.window.close();
console.log('pinned recent tracking status tests passed');
