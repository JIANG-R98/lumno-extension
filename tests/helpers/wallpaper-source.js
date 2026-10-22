const { moduleScript } = require('./module-script');

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

module.exports = {
  WALLPAPER_DEPENDENCY_GLOBALS,
  readWallpaperRuntimeSource
};
