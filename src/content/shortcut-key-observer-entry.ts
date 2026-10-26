// The manifest content script every frame loads at document start: the
// shortcut key observer, with the link preview's Shift+click trigger riding
// along, since it needs the same entry and one script per frame costs less.
import './shortcut-key-observer';
import './link-preview-trigger';
