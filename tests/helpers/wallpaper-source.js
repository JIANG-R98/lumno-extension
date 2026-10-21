const fs = require('fs');
const path = require('path');
const { withoutExports } = require('./closure-source');
const { moduleScript } = require('./module-script');

const repoRoot = path.resolve(__dirname, '..', '..');
// wallpaper.js followed by the parts of its runtime split out into
// wallpaper/runtime/, in the order newtab.html loads them. Every file only
// defines a global while loading, so the runtime can be evaluated from this
// list in one go.
const WALLPAPER_RUNTIME_FILES = [
  'src/newtab/wallpaper/wallpaper.js',
  'src/newtab/wallpaper/runtime/favicon-chooser.js',
  'src/newtab/wallpaper/runtime/wallpaper-sources.js',
  'src/newtab/wallpaper/runtime/wallpaper-visual.js',
  'src/newtab/wallpaper/runtime/wallpaper-storage.js',
  'src/newtab/wallpaper/runtime/wallpaper-overlay.js',
  'src/newtab/wallpaper/runtime/wallpaper-effect-prefs.js',
  'src/newtab/wallpaper/runtime/panel-motion.js',
  'src/newtab/wallpaper/runtime/panel-settings.js',
  'src/newtab/wallpaper/runtime/wallpaper-selection.js',
  'src/newtab/wallpaper/runtime/custom-wallpapers.js',
  'src/newtab/wallpaper/runtime/panel-state.js',
  'src/newtab/wallpaper/runtime/panel-actions.js',
  'src/newtab/wallpaper/runtime/daily-wallpapers.js'
];

// The modules the runtime imports that tests may hand in as context globals,
// so test doubles can replace their functions.
const WALLPAPER_DEPENDENCY_GLOBALS = Object.freeze({
  'src/shared/settings.js': 'LumnoSettings',
  'src/newtab/remote-content.js': 'LumnoNewtabRemoteContent',
  'src/newtab/wallpaper/wallpaper-adaptive-tone.js': 'LumnoNewtabWallpaperAdaptiveTone',
  'src/newtab/wallpaper/wallpaper-effects.js': 'LumnoNewtabWallpaperEffects',
  'src/newtab/wallpaper/wallpaper-local-store.js': 'LumnoNewtabWallpaperLocalStore'
});

// The runtime as the page runs it, for evaluating in a test context: a
// script that leaves the wallpaper module's exports on LumnoNewtabWallpaper.
// With stubs (such as WALLPAPER_DEPENDENCY_GLOBALS), those imports read the
// context's globals instead.
function readWallpaperRuntimeSource(stubs) {
  return moduleScript('src/newtab/wallpaper/wallpaper.js', 'LumnoNewtabWallpaper', null, stubs);
}

// The files for source checks: the parts share runtime state as properties
// of one `wallpaperState` object, which this drops so checks see the code as
// it read inside the single runtime closure.
function readWallpaperCheckSource() {
  return withoutExports(WALLPAPER_RUNTIME_FILES.map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8')).join('\n'))
    .replace(/\bwallpaperState\./g, '');
}

module.exports = {
  WALLPAPER_DEPENDENCY_GLOBALS,
  WALLPAPER_RUNTIME_FILES,
  readWallpaperCheckSource,
  readWallpaperRuntimeSource
};
