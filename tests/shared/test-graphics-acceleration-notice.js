const assert = require('assert');
const fs = require('fs');

const graphics = require('../../src/platform/graphics-acceleration.ts');
const graphicsNotice = require('../../src/shared/graphics-acceleration-notice.ts');
const featureHints = require('../../src/shared/ui/feature-hints.ts');
const updateNotice = require('../../src/shared/update-notice.ts');
const { createNewtabPage } = require('../helpers/newtab-page');
const { ENGAGEMENT_DELAY_MS, engagementStorage } = require('../helpers/newtab-notices');

const DISMISS_KEY = featureHints.getFeatureHintLocalDismissKey(graphicsNotice.createGraphicsNoticeDefinition('newtab'));

// The probe asks for a WebGL context that refuses a major performance
// caveat: one only the GPU can give. It releases the context it got.
{
  let lost = 0;
  const gpuCanvas = {
    getContext(type, attributes) {
      assert.strictEqual(type, 'webgl');
      assert.strictEqual(attributes.failIfMajorPerformanceCaveat, true);
      return { getExtension: () => ({ loseContext() { lost += 1; } }) };
    }
  };
  assert.strictEqual(graphics.probeGraphicsRendering(() => gpuCanvas), 'hardware');
  assert.strictEqual(lost, 1, 'the probe should release its context');
  assert.strictEqual(graphics.probeGraphicsRendering(() => ({ getContext: () => null })), 'software');
  assert.strictEqual(graphics.probeGraphicsRendering(() => null), 'unknown');
  assert.strictEqual(graphics.probeGraphicsRendering(() => ({ getContext() { throw new Error('lost'); } })), 'unknown');
  assert.deepStrictEqual(graphics.normalizeGraphicsProbe({ rendering: 'gpu', checkedAt: -1 }), { rendering: 'unknown', checkedAt: 0 });
  assert.strictEqual(graphics.getGraphicsSettingsUrl('chrome://'), 'chrome://settings/system');
  assert.strictEqual(graphics.getGraphicsSettingsUrl('edge://'), 'edge://settings/system');
  assert.strictEqual(graphics.getGraphicsSettingsUrl('opera://'), 'chrome://settings/system');
}

// A New Tab whose feature hints were seen and whose engagement prompt is due,
// with the probe's answer stored by the worker.
async function openNewtab(options) {
  const config = options || {};
  const local = Object.assign({
    [graphics.GRAPHICS_PROBE_STORAGE_KEY]: { rendering: config.rendering || 'software', checkedAt: 1 }
  }, config.local || {});
  const page = await createNewtabPage(engagementStorage({
    language: config.language || 'en',
    updateNotice: config.updateNotice,
    sync: config.sync,
    local
  }));
  await page.settle(ENGAGEMENT_DELAY_MS + 600);
  page.notice = () => page.document.querySelector('.x-lumno-feature-hint--graphics-notice');
  page.noticeVisible = () => Boolean(page.notice() && page.notice().getAttribute('data-visible') === 'true');
  page.engagementVisible = () => {
    const prompt = page.document.querySelector('.x-lumno-feature-hint[data-engagement-surface="newtab"]');
    return Boolean(prompt && prompt.getAttribute('data-visible') === 'true');
  };
  return page;
}

(async () => {
  // Without the GPU the capsule shows below the search box, counts the
  // showing and keeps the engagement prompt away for this page view.
  const shown = await openNewtab();
  assert.strictEqual(shown.noticeVisible(), true, 'software rendering should show the notice');
  assert.ok(shown.notice().textContent.includes('Graphics acceleration is off'));
  assert.strictEqual(shown.storage.local.data[graphics.GRAPHICS_NOTICE_DISPLAY_COUNT_STORAGE_KEY], 1);
  assert.strictEqual(shown.engagementVisible(), false, 'the notice should take the session slot');
  await shown.click(shown.notice().querySelector('.x-lumno-feature-hint__link'));
  await shown.settle(50);
  assert.ok(shown.messages.some((message) => message.action === 'openGraphicsSettings' && message.disposition === 'newTab'),
    'its link should open the browser setting');
  assert.strictEqual(shown.noticeVisible(), false, 'and close it');
  assert.strictEqual(shown.storage.local.data[DISMISS_KEY], true, 'for good on this computer');
  shown.close();

  // A restart with the GPU back hides an open notice.
  const restarted = await openNewtab();
  restarted.changeStorage('local', graphics.GRAPHICS_PROBE_STORAGE_KEY, { rendering: 'hardware', checkedAt: 2 });
  await restarted.settle(20);
  assert.strictEqual(restarted.noticeVisible(), false);
  restarted.close();

  const hardware = await openNewtab({ rendering: 'hardware' });
  assert.strictEqual(hardware.noticeVisible(), false, 'the GPU drawing should show nothing');
  assert.strictEqual(hardware.engagementVisible(), true, 'and leave the slot to the engagement prompt');
  hardware.close();

  const exhausted = await openNewtab({ local: { [graphics.GRAPHICS_NOTICE_DISPLAY_COUNT_STORAGE_KEY]: 3 } });
  assert.strictEqual(exhausted.noticeVisible(), false, 'three showings should be the limit');
  exhausted.close();

  const zhMessages = JSON.parse(fs.readFileSync('_locales/zh_CN/messages.json', 'utf8'));
  const zh = await openNewtab({ language: 'zh-CN' });
  assert.ok(zh.notice().textContent.includes(zhMessages.graphics_notice_badge.message), 'the notice should speak the page language');
  zh.close();

  // A pending update notice keeps the slot.
  const version = JSON.parse(fs.readFileSync('manifest.json', 'utf8')).version;
  const update = await openNewtab({
    updateNotice: true,
    sync: { [updateNotice.UPDATE_NOTICE_STORAGE_KEY]: { version, previousVersion: '0.0.1', reason: 'update', updatedAt: 1 } }
  });
  const updateVisible = Array.from(update.document.querySelectorAll('.x-lumno-feature-hint--update-notice'))
    .some((hint) => hint.getAttribute('data-visible') === 'true' &&
      !hint.classList.contains('x-lumno-feature-hint--graphics-notice') &&
      !hint.hasAttribute('data-engagement-surface'));
  assert.strictEqual(updateVisible, true, 'the update notice should show');
  assert.strictEqual(update.noticeVisible(), false, 'and the graphics notice wait for another page view');
  update.close();

  console.log('graphics acceleration notice tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
