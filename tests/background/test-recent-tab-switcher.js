const assert = require('assert');
const fs = require('fs');
const path = require('path');

const helperPath = path.join(__dirname, '..', '..', 'src', 'background', 'recent-tab-switcher.ts');

assert.ok(fs.existsSync(helperPath), 'recent tab switcher helper should exist');

const switcher = require(helperPath);

function testRecentStackKeepsLatestFiveSwitchableTabs() {
  const tracker = switcher.createRecentTabTracker({
    limit: 5,
    shouldIncludeTab: (tab) => Boolean(tab && /^https?:/.test(tab.url || ''))
  });

  [
    { id: 1, windowId: 10, url: 'https://one.example/', title: 'One' },
    { id: 2, windowId: 10, url: 'https://two.example/', title: 'Two' },
    { id: 3, windowId: 10, url: 'chrome://extensions/', title: 'Extensions' },
    { id: 4, windowId: 11, url: 'https://four.example/', title: 'Four' },
    { id: 5, windowId: 11, url: 'https://five.example/', title: 'Five' },
    { id: 6, windowId: 12, url: 'https://six.example/', title: 'Six' },
    { id: 7, windowId: 12, url: 'https://seven.example/', title: 'Seven' },
    { id: 2, windowId: 10, url: 'https://two.example/', title: 'Two again' }
  ].forEach((tab) => tracker.recordTab(tab, tab.id * 1000));

  const tabs = [
    { id: 1, windowId: 10, url: 'https://one.example/', title: 'One' },
    { id: 2, windowId: 10, url: 'https://two.example/', title: 'Two again' },
    { id: 4, windowId: 11, url: 'https://four.example/', title: 'Four' },
    { id: 5, windowId: 11, url: 'https://five.example/', title: 'Five' },
    { id: 6, windowId: 12, url: 'https://six.example/', title: 'Six' },
    { id: 7, windowId: 12, url: 'https://seven.example/', title: 'Seven' },
    { id: 8, windowId: 12, url: 'https://eight.example/', title: 'Eight', incognito: true }
  ];

  assert.deepStrictEqual(
    tracker.getRecentTabs(tabs).map((tab) => tab.id),
    [2, 7, 6, 5, 4],
    'switcher should show the five most recently visited switchable tabs'
  );
}

function testCustomShortcutCommitModifierNormalization() {
  assert.strictEqual(
    switcher.getShortcutCommitModifierEventKey('Command+1'),
    'Meta',
    'Chrome Command shortcuts should still expose their primary modifier for held-key suppression'
  );
  assert.strictEqual(switcher.getShortcutCommitModifierEventKey('Ctrl+Shift+J'), 'Control');
  assert.strictEqual(switcher.getShortcutCommitModifierEventKey('Alt+Q'), 'Alt');
  assert.strictEqual(switcher.getShortcutCommitModifierEventKey('Shift+F2'), 'Shift');
  assert.strictEqual(switcher.getShortcutCommitModifierEventKey('⌘1'), 'Meta');
  assert.strictEqual(switcher.getShortcutCommitModifierEventKey('⌃⇧/'), 'Control');
  assert.strictEqual(switcher.getShortcutCommitModifierEventKey(''), '');
  assert.strictEqual(switcher.getShortcutTriggerEventKey('Command+1'), '1');
  assert.strictEqual(switcher.getShortcutTriggerEventKey('Command+Shift+J'), 'j');
  assert.strictEqual(switcher.getShortcutTriggerEventKey('Ctrl+Shift+/'), '/');
  assert.strictEqual(switcher.getShortcutTriggerEventKey('⌘1'), '1');
  assert.strictEqual(switcher.getShortcutTriggerEventKey('⌃⇧/'), '/');
  assert.strictEqual(switcher.getShortcutTriggerEventKey('Shift+F2'), 'F2');
  assert.strictEqual(switcher.getShortcutTriggerEventKey('Ctrl+Shift+Comma'), ',');
  assert.strictEqual(switcher.getShortcutTriggerEventKey('⌃⇥'), 'Tab',
    'macOS shows a Ctrl+Tab binding as ⌃⇥');
  assert.strictEqual(switcher.getShortcutTriggerEventKey('Ctrl+Tab'), 'Tab');
  assert.deepStrictEqual(
    switcher.getShortcutReleaseEventKeys('Command+1'),
    ['Meta'],
    'a custom Command shortcut should commit when Command is released'
  );
  assert.deepStrictEqual(switcher.getShortcutReleaseEventKeys('Command+Shift+J'), ['Meta']);
  assert.deepStrictEqual(switcher.getShortcutReleaseEventKeys('⌘1'), ['Meta']);
  assert.deepStrictEqual(switcher.getShortcutReleaseEventKeys('⌃⇧/'), ['Control']);
  assert.deepStrictEqual(switcher.getShortcutReleaseEventKeys('Ctrl+Shift+/'), ['Control']);
  assert.deepStrictEqual(switcher.getShortcutReleaseEventKeys('Alt+Shift+Q'), ['Alt']);
  assert.deepStrictEqual(switcher.getShortcutReleaseEventKeys('Alt+Q'), ['Alt']);
  assert.deepStrictEqual(switcher.getShortcutReleaseEventKeys('⌃⇥'), ['Control']);
}

function testThumbnailCacheMatchesUrlAndHydratesFromState() {
  const tracker = switcher.createRecentTabTracker({
    limit: 5,
    thumbnailLimit: 4,
    thumbnailTtlMs: Number.MAX_SAFE_INTEGER,
    shouldIncludeTab: (tab) => Boolean(tab && tab.url)
  });

  tracker.recordTab({ id: 11, windowId: 10, url: 'chrome://history/', title: 'History' }, 100);
  tracker.setThumbnail(11, 'data:image/jpeg;base64,aGlzdG9yeQ==', 150, {
    url: 'chrome://history/'
  });

  assert.strictEqual(
    tracker.getThumbnail(11, 'chrome://history/'),
    'data:image/jpeg;base64,aGlzdG9yeQ==',
    'thumbnail should be returned when the current tab URL matches the cached URL'
  );
  assert.strictEqual(
    tracker.getThumbnail(11, 'chrome://downloads/'),
    '',
    'thumbnail should not be returned after a tab navigates to a different URL'
  );

  const state = tracker.exportState({ now: 200 });
  const hydrated = switcher.createRecentTabTracker({
    limit: 5,
    thumbnailLimit: 4,
    thumbnailTtlMs: Number.MAX_SAFE_INTEGER,
    shouldIncludeTab: (tab) => Boolean(tab && tab.url)
  });
  hydrated.hydrateState(state, { now: 250 });

  assert.deepStrictEqual(
    hydrated.getRecentTabs([
      { id: 11, windowId: 10, url: 'chrome://history/', title: 'History' }
    ]).map((tab) => [tab.id, tab._xSwitcherThumbnail]),
    [[11, 'data:image/jpeg;base64,aGlzdG9yeQ==']],
    'recent stack and matching thumbnails should hydrate from persisted switcher state'
  );
}

function testRecordingSameTabKeepsMatchingThumbnail() {
  const tracker = switcher.createRecentTabTracker({
    limit: 5,
    thumbnailLimit: 4,
    thumbnailTtlMs: Number.MAX_SAFE_INTEGER,
    shouldIncludeTab: (tab) => Boolean(tab && tab.url)
  });

  tracker.recordTab({ id: 12, windowId: 10, url: 'https://one.example/', title: 'One' }, 100);
  tracker.setThumbnail(12, 'data:image/jpeg;base64,b25l', 120, {
    url: 'https://one.example/'
  });
  tracker.recordTab({ id: 12, windowId: 10, url: 'https://one.example/', title: 'One again' }, 200);

  const recent = tracker.getRecentTabs([
    { id: 12, windowId: 10, url: 'https://one.example/', title: 'One again' }
  ])[0];

  assert.strictEqual(
    recent._xSwitcherThumbnail,
    'data:image/jpeg;base64,b25l',
    'recording a tab again should not discard its matching thumbnail'
  );
  assert.strictEqual(recent._xSwitcherThumbnailStatus, 'ok');
}

function testThumbnailStatusPersistsAndReportsStaleness() {
  const tracker = switcher.createRecentTabTracker({
    limit: 5,
    thumbnailLimit: 4,
    thumbnailTtlMs: Number.MAX_SAFE_INTEGER,
    shouldIncludeTab: (tab) => Boolean(tab && tab.url)
  });

  tracker.recordTab({ id: 21, windowId: 10, url: 'https://one.example/', title: 'One' }, 100);
  tracker.setThumbnailStatus(21, 'pending', 110, {
    url: 'https://one.example/',
    reason: 'activated'
  });

  let recent = tracker.getRecentTabs([
    { id: 21, windowId: 10, url: 'https://one.example/', title: 'One' }
  ])[0];
  assert.strictEqual(recent._xSwitcherThumbnail, '', 'pending thumbnail should not invent an image');
  assert.strictEqual(recent._xSwitcherThumbnailStatus, 'pending');
  assert.strictEqual(recent._xSwitcherThumbnailReason, 'activated');

  tracker.setThumbnailStatus(21, 'failed', 120, {
    url: 'https://one.example/',
    reason: 'inactive-tab'
  });
  recent = tracker.getRecentTabs([
    { id: 21, windowId: 10, url: 'https://one.example/', title: 'One' }
  ])[0];
  assert.strictEqual(recent._xSwitcherThumbnailStatus, 'failed');
  assert.strictEqual(recent._xSwitcherThumbnailReason, 'inactive-tab');

  tracker.setThumbnail(21, 'data:image/jpeg;base64,b25l', 130, {
    url: 'https://one.example/'
  });
  recent = tracker.getRecentTabs([
    { id: 21, windowId: 10, url: 'https://one.example/', title: 'One' }
  ])[0];
  assert.strictEqual(recent._xSwitcherThumbnail, 'data:image/jpeg;base64,b25l');
  assert.strictEqual(recent._xSwitcherThumbnailStatus, 'ok');
  assert.strictEqual(recent._xSwitcherThumbnailReason, '');

  recent = tracker.getRecentTabs([
    { id: 21, windowId: 10, url: 'https://two.example/', title: 'Two' }
  ])[0];
  assert.strictEqual(recent._xSwitcherThumbnail, '', 'stale thumbnails should not be shown after URL changes');
  assert.strictEqual(recent._xSwitcherThumbnailStatus, 'stale');
  assert.strictEqual(recent._xSwitcherThumbnailReason, 'url-mismatch');

  tracker.recordTab({ id: 22, windowId: 10, url: 'chrome://extensions/', title: 'Extensions' }, 200);
  tracker.setThumbnailStatus(22, 'restricted', 210, {
    url: 'chrome://extensions/',
    reason: 'chrome-restricted-page'
  });
  const state = tracker.exportState({ now: 220 });
  const hydrated = switcher.createRecentTabTracker({
    limit: 5,
    thumbnailLimit: 4,
    thumbnailTtlMs: Number.MAX_SAFE_INTEGER,
    shouldIncludeTab: (tab) => Boolean(tab && tab.url)
  });
  hydrated.hydrateState(state, { now: 230 });
  recent = hydrated.getRecentTabs([
    { id: 22, windowId: 10, url: 'chrome://extensions/', title: 'Extensions' }
  ])[0];
  assert.strictEqual(recent._xSwitcherThumbnailStatus, 'restricted');
  assert.strictEqual(recent._xSwitcherThumbnailReason, 'chrome-restricted-page');
}

function testDirtyHydrationMergesCachedThumbnailBeforePersisting() {
  const persisted = switcher.createRecentTabTracker({
    limit: 5,
    thumbnailLimit: 4,
    thumbnailTtlMs: Number.MAX_SAFE_INTEGER,
    shouldIncludeTab: (tab) => Boolean(tab && tab.url)
  });
  persisted.recordTab({ id: 31, windowId: 10, url: 'https://one.example/', title: 'One' }, 100);
  persisted.recordTab({ id: 32, windowId: 10, url: 'https://two.example/', title: 'Two' }, 90);
  persisted.setThumbnail(31, 'data:image/jpeg;base64,b25lLW9sZA==', 110, {
    url: 'https://one.example/'
  });

  const tracker = switcher.createRecentTabTracker({
    limit: 5,
    thumbnailLimit: 4,
    thumbnailTtlMs: Number.MAX_SAFE_INTEGER,
    shouldIncludeTab: (tab) => Boolean(tab && tab.url)
  });
  tracker.recordTab({ id: 31, windowId: 10, url: 'https://one.example/', title: 'One focused' }, 1000);
  tracker.setThumbnailStatus(31, 'pending', 1010, {
    url: 'https://one.example/',
    reason: 'visible'
  });

  tracker.hydrateState(persisted.exportState({ now: 120 }), {
    now: 1020,
    merge: true
  });

  const recentTabs = tracker.getRecentTabs([
    { id: 31, windowId: 10, url: 'https://one.example/', title: 'One focused' },
    { id: 32, windowId: 10, url: 'https://two.example/', title: 'Two' }
  ]);

  assert.deepStrictEqual(
    recentTabs.map((tab) => tab.id),
    [31, 32],
    'dirty hydration should keep the just-focused tab first while restoring persisted tabs'
  );
  assert.strictEqual(
    recentTabs[0]._xSwitcherThumbnail,
    'data:image/jpeg;base64,b25lLW9sZA==',
    'dirty hydration should keep the cached cover visible while a fresh capture is pending'
  );
  assert.strictEqual(recentTabs[0]._xSwitcherThumbnailStatus, 'pending');
  assert.strictEqual(recentTabs[0]._xSwitcherThumbnailReason, 'visible');
}

async function testCrossWindowSwitchFocusesWindowBeforeActivatingTab() {
  const calls = [];
  const chromeApi = {
    runtime: { lastError: null },
    windows: {
      update: (windowId, updateInfo, callback) => {
        calls.push(['windows.update', windowId, updateInfo]);
        callback({ id: windowId, focused: true });
      }
    },
    tabs: {
      update: (tabId, updateInfo, callback) => {
        calls.push(['tabs.update', tabId, updateInfo]);
        callback({ id: tabId, windowId: 22, active: true });
      }
    }
  };

  const result = await switcher.focusWindowAndActivateTab(chromeApi, {
    tabId: 42,
    windowId: 22
  });

  assert.deepStrictEqual(calls, [
    ['windows.update', 22, { focused: true }],
    ['tabs.update', 42, { active: true }]
  ]);
  assert.deepStrictEqual(result, { ok: true, tabId: 42, windowId: 22 });
}

(async () => {
  testRecentStackKeepsLatestFiveSwitchableTabs();
  testCustomShortcutCommitModifierNormalization();
  testThumbnailCacheMatchesUrlAndHydratesFromState();
  testRecordingSameTabKeepsMatchingThumbnail();
  testThumbnailStatusPersistsAndReportsStaleness();
  testDirtyHydrationMergesCachedThumbnailBeforePersisting();
  await testCrossWindowSwitchFocusesWindowBeforeActivatingTab();
  console.log('recent tab switcher tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
