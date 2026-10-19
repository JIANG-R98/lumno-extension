(function() {
  const root = document.documentElement;
  const body = document.body;
  const preloadState = globalThis.LumnoNewtabWallpaperPreload;
  const effects = globalThis.LumnoNewtabWallpaperEffects;
  if (!root ||
      !body ||
      !preloadState ||
      !preloadState.wallpaper ||
      !(preloadState.imageUrl || preloadState.imageReady) ||
      !preloadState.effectPrefsReady) {
    return;
  }

  const liveState = {
    onRender() {},
    shouldAnimateTransition: () => false
  };
  const preloadRuntime = {
    claimed: false,
    controller: null,
    // When this script revealed the wallpaper (performance.now()); the entry starts a beat later.
    wallpaperShownAt: 0,
    attach(options) {
      const config = options || {};
      if (typeof config.onRender === 'function') {
        liveState.onRender = config.onRender;
      }
      if (typeof config.shouldAnimateTransition === 'function') {
        liveState.shouldAnimateTransition = config.shouldAnimateTransition;
      }
    },
    updateSource(wallpaper, imageUrl) {
      preloadState.wallpaper = wallpaper || null;
      preloadState.imageUrl = String(imageUrl || '');
    }
  };
  globalThis.LumnoNewtabWallpaperEffectPreload = preloadRuntime;

  // Created up front so wallpaper.js always adopts this controller instead of starting its own, slower
  // render; it renders nothing until the preferences and the image are known.
  const controller = effects.createWallpaperEffects({
    documentObj: document,
    windowObj: window,
    getCurrentWallpaper: () => preloadState.wallpaper,
    getWallpaperImageUrl: () => preloadState.imageUrl,
    shouldAnimateTransition: () => liveState.shouldAnimateTransition(),
    onRender: () => liveState.onRender(),
    // The luminance an earlier page measured belongs to the image this page preloaded.
    getLuminanceHint: (imageUrl) => {
      const luminance = preloadState.luminance;
      if (typeof luminance !== 'number') {
        return null;
      }
      if (preloadState.initialImageUrl) {
        return imageUrl === preloadState.initialImageUrl ? luminance : null;
      }
      return preloadState.runtimeApplied ? null : luminance;
    }
  });
  let runtimeAppliedPrefs = false;
  preloadRuntime.controller = Object.assign({}, controller, {
    apply(prefs) {
      runtimeAppliedPrefs = true;
      return controller.apply(prefs);
    }
  });

  // The page stays hidden until the wallpaper image has decoded, so it appears whole and never
  // part-drawn; an image that takes longer than this shows as it arrives.
  const IMAGE_DECODE_WAIT_MAX_MS = 1000;
  // null when there is nothing to wait on.
  function whenImageDecoded() {
    const decoded = preloadState.imageDecoded;
    if (!decoded || typeof decoded.then !== 'function' || typeof globalThis.setTimeout !== 'function') {
      return null;
    }
    return Promise.race([
      decoded,
      new Promise((resolve) => globalThis.setTimeout(resolve, IMAGE_DECODE_WAIT_MAX_MS))
    ]);
  }

  let wallpaperMarkedReady = false;
  function markWallpaperReady() {
    if (!document.body || wallpaperMarkedReady) {
      return;
    }
    wallpaperMarkedReady = true;
    document.body.setAttribute('data-nt-wallpaper-ready', '1');
    preloadRuntime.wallpaperShownAt = globalThis.performance ? globalThis.performance.now() : 0;
  }

  // The page stays unpainted until this resolves, so the wallpaper and its effect appear together.
  function startEffects(prefs, imageUrl) {
    // Once wallpaper.js applies its own preferences it also decides when the wallpaper is ready.
    if (preloadRuntime.claimed || runtimeAppliedPrefs || !imageUrl) {
      return;
    }
    const normalized = effects.resolvePrefsForMode(prefs, preloadState.mode);
    if (normalized.type === 'none') {
      body.setAttribute('data-wallpaper-effect', 'none');
      const decoded = whenImageDecoded();
      if (decoded) {
        decoded.then(markWallpaperReady);
      } else {
        markWallpaperReady();
      }
      return;
    }

    body.setAttribute('data-wallpaper-active', 'true');
    body.setAttribute('data-wallpaper-effect', normalized.type);
    controller.apply(normalized);
    const rendered = controller.refresh({ immediate: true });
    const decoded = whenImageDecoded();
    (decoded ? Promise.all([rendered, decoded]) : rendered).then(markWallpaperReady);
  }

  // An online photo's IndexedDB copy may still be loading; without one, wallpaper.js takes over.
  const imageReady = preloadState.imageUrl ? null : preloadState.imageReady;
  preloadState.effectPrefsReady.then((prefs) => {
    if (!imageReady) {
      return startEffects(prefs, preloadState.imageUrl);
    }
    return imageReady.then((imageUrl) => startEffects(prefs, imageUrl));
  }).catch(markWallpaperReady);
})();
