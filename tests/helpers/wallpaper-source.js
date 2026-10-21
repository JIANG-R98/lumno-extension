const fs = require('fs');
const path = require('path');

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

// The runtime as the page loads it, for evaluating in a test context.
function readWallpaperRuntimeSource() {
  return WALLPAPER_RUNTIME_FILES.map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8')).join('\n;\n');
}

// The same files for source checks: the parts share runtime state as
// properties of one `wallpaperState` object, which this drops so checks see
// the code as it read inside the single runtime closure.
function readWallpaperCheckSource() {
  return readWallpaperRuntimeSource().replace(/\bwallpaperState\./g, '');
}

module.exports = { WALLPAPER_RUNTIME_FILES, readWallpaperRuntimeSource, readWallpaperCheckSource };
