const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readBackgroundSource } = require('../helpers/background-source');
const { readOverlayPanelSource } = require('../helpers/overlay-source');
const { readReactSource } = require('../helpers/react-source');
const { getInjectedScripts } = require('../helpers/runtime-scripts');

const repoRoot = path.join(__dirname, '..', '..');
const backgroundJs = readBackgroundSource();
const contentJs = fs.readFileSync(path.join(repoRoot, 'src/content/document-pip-picker.js'), 'utf8');
const overlayRuntimeJs = fs.readFileSync(path.join(repoRoot, 'src/overlay/runtime.js'), 'utf8');
const overlayJs = readOverlayPanelSource();
const suggestionsReact = readReactSource('react-src/search/suggestions.tsx');
const actionModelJs = fs.readFileSync(path.join(repoRoot, 'src/shared/search/suggestion-action-model.js'), 'utf8');

assert.match(
  overlayRuntimeJs,
  /documentPipEnabled:\s*'_x_extension_document_pip_enabled_2026_unique_'/,
  'overlay runtime should expose the web clip storage key'
);

assert.match(
  backgroundJs,
  /documentPipEnabled:\s*documentPipEnabledCache/,
  'background should pass the current web clip setting into the overlay context'
);

// The openDocumentPipPicker message is covered by
// tests/background/test-background-message-handlers.js.
assert.match(
  contentJs,
  /function refreshPiPContent\(session\)/,
  'web clip should keep a reusable PiP content refresh path'
);
assert.match(
  contentJs,
  /session\.contentObserver\.observe\(element,[\s\S]*characterData:\s*true[\s\S]*attributes:\s*true/,
  'web clip should observe source DOM changes so dynamic text can refresh in PiP'
);

assert.match(
  overlayJs,
  /documentPipEnabled = documentPipSupported && Boolean\(normalizedOverlayContext\.documentPipEnabled\);/,
  'overlay should initialize web clip command visibility from the injected context'
);
assert.match(
  overlayJs,
  /type:\s*'commandDocumentPip'[\s\S]*?primary:\s*'clip'[\s\S]*?requiresDocumentPipEnabled:\s*true/,
  'overlay command definitions should include a plain clip command gated by the web clip setting'
);
assert.match(
  overlayJs,
  /if \(command\.requiresDocumentPipEnabled && !documentPipEnabled\) \{[\s\S]*?continue;/,
  'clip command matching should be skipped while web clip is disabled'
);
assert.match(
  overlayJs,
  /function openDocumentPipPickerFromOverlay\(\)[\s\S]*?chrome\.runtime\.sendMessage\(\{\s*action:\s*'openDocumentPipPicker'\s*\}\)[\s\S]*?selectedSuggestion\.type === 'commandDocumentPip'[\s\S]*?openDocumentPipPickerFromOverlay\(\)/,
  'overlay should activate the web clip command through the background picker action'
);
assert.match(
  suggestionsReact,
  /commandDocumentPip:\s*'ri-scissors-cut-line'/,
  'the React suggestions view should render web clip commands with a dedicated clipping icon'
);
assert.match(
  overlayJs,
  /storageChangeListeners\.add\(\(changes,\s*areaName\) => \{[\s\S]*?!changes\[DOCUMENT_PIP_ENABLED_STORAGE_KEY\][\s\S]*?documentPipEnabled = documentPipSupported && changes\[DOCUMENT_PIP_ENABLED_STORAGE_KEY\]\.newValue === true[\s\S]*?\}\);/,
  'overlay should keep clip command visibility synced if the setting changes'
);

assert.match(
  contentJs,
  /function handlePiPLinkClick\(event, session\) \{[\s\S]*?url\.search === pageUrl\.search\) \{\s*\/\/[^\n]*\n\s*if \(!url\.hash\) \{\s*return;\s*\}[\s\S]*?action: 'createTab'/,
  'a clipped href="#" link should not open the page again in a new tab'
);

assert.match(
  actionModelJs,
  /const COMMAND_SUGGESTION_TYPES = new Set\(\[[\s\S]*?'commandDocumentPip'[\s\S]*?\]\);[\s\S]*?COMMAND_SUGGESTION_TYPES\.has\(suggestion\.type\)[\s\S]*?return null;/,
  'web clip command rows should rely on whole-row activation without a redundant action button'
);

['en', 'ja', 'zh_CN', 'zh_TW'].forEach((locale) => {
  const messages = JSON.parse(fs.readFileSync(path.join(repoRoot, '_locales', locale, 'messages.json'), 'utf8'));
  assert.ok(messages.document_pip_command_title && messages.document_pip_command_title.message, `${locale} should localize the web clip command title`);
  assert.ok(messages.document_pip_command_action && messages.document_pip_command_action.message, `${locale} should localize the web clip command action`);
});

assert.deepStrictEqual(
  getInjectedScripts('documentPipPicker').filter((file) => !file.includes('codex-debug')),
  ['src/shared/ui/toast.js', 'src/content/document-pip-picker.js'],
  'the web clip picker should be injected after the shared Toast it uses'
);
assert.match(
  contentJs,
  /import \* as TOAST from '\.\.\/shared\/ui\/toast\.js';[\s\S]*?TOAST\.createToastController\(/,
  'the web clip picker should show its messages through the shared Toast'
);
assert.match(
  contentJs,
  /attachShadow\(\{ mode: 'closed' \}\)[\s\S]*?getURL\('src\/shared\/ui\/toast\.css'\)/,
  'the web clip Toast should load the shared Toast styles inside its own shadow root'
);

assert.match(
  backgroundJs,
  /function openDocumentPipPickerOnTab\(activeTab, source\) \{\s*return documentPipEnabledReady\.then\(/,
  'web clip entry points should wait for the stored setting when the service worker wakes'
);
assert.match(
  backgroundJs,
  /documentPipEnabledCache = normalizedDocumentPip;\s*resolveDocumentPipEnabledReady\(\);/,
  'the web clip setting read at startup should release waiting entry points'
);
assert.match(
  backgroundJs,
  /function openDocumentPipSettings\(\) \{\s*openExtensionOptionsPage\(\{ hash: 'labs:document-pip' \}\);/,
  'with web clip off, its entry points should open settings at the web clip switch'
);
assert.match(
  contentJs,
  /requestWindow\([\s\S]*?\}\);[\s\S]*?await requestDocumentPipOwnership\(\);/,
  'the PiP window should open before any background round trip spends the click activation'
);

console.log('document PiP clip command tests passed');
