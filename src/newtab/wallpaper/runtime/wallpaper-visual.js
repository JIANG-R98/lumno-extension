(function(root) {
  // Putting a wallpaper on screen: CSS-safe image URLs, waiting for images
  // to decode, the cross-fade transition layer, and the visual refresh that
  // applies the current wallpaper, overlay and effect.
  function createWallpaperVisual(deps) {
    const {
      document,
      window,
      getResolvedWallpaperOverlayMode,
      NEWTAB_WALLPAPER_OVERLAY_STOPS,
      getWallpaperOverlayOpacityForCurrentMode,
      getWallpaperOverlayStopPercent,
      getAdaptiveToneTargets,
      chrome,
      windowObj,
      isNetworkWallpaperImageUrl,
      wallpaperNetworkImageStates,
      shouldReduceMotion,
      getDisplayedWallpaperImageUrl,
      wallpaperEffectPreload,
      refreshWallpaperAdaptiveSampler,
      afterNextPaint
    } = deps;

    // The runtime state object shared with wallpaper.js and the other modules.
    const wallpaperState = deps.wallpaperState;

    const WALLPAPER_VISUAL_TRANSITION_MS = 220;
    const WALLPAPER_FILTER_TRANSITION_MS = 180;
    const WALLPAPER_VISUAL_REFRESH_DELAY_MS = 80;
    const WALLPAPER_IMAGE_READY_CACHE_LIMIT = 8;
    const WALLPAPER_NETWORK_IMAGE_TIMEOUT_MS = 8000;
    let wallpaperVisualRefreshTimer = 0;
    const wallpaperImageReadyCache = new Map();

    // Used by overlay math; adaptive image sampling lives in wallpaper-adaptive-tone.js.
    function clampNumber(value, min, max) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return min;
      }
      return Math.min(max, Math.max(min, number));
    }

    function getViewportSize() {
      const docEl = document.documentElement;
      return {
        width: Math.max(1, window.innerWidth || (docEl ? docEl.clientWidth : 0) || 1),
        height: Math.max(1, window.innerHeight || (docEl ? docEl.clientHeight : 0) || 1)
      };
    }

    function getWallpaperOverlayAlphaAtViewportY(viewportY) {
      const mode = getResolvedWallpaperOverlayMode();
      const stops = NEWTAB_WALLPAPER_OVERLAY_STOPS[mode] || NEWTAB_WALLPAPER_OVERLAY_STOPS.light;
      const opacity = getWallpaperOverlayOpacityForCurrentMode();
      const topAlpha = getWallpaperOverlayStopPercent(stops.top, opacity) / 100;
      const midAlpha = getWallpaperOverlayStopPercent(stops.mid, opacity) / 100;
      const bottomAlpha = getWallpaperOverlayStopPercent(stops.bottom, opacity) / 100;
      const viewport = getViewportSize();
      const position = clampNumber(viewportY / viewport.height, 0, 1);
      if (position <= 0.42) {
        return topAlpha + ((midAlpha - topAlpha) * (position / 0.42));
      }
      return midAlpha + ((bottomAlpha - midAlpha) * ((position - 0.42) / 0.58));
    }

    function getWallpaperAdaptiveToneTargets() {
      const externalTargets = typeof getAdaptiveToneTargets === 'function'
        ? getAdaptiveToneTargets()
        : [];
      const targets = Array.isArray(externalTargets) ? externalTargets.slice() : [];
      targets.push({
        element: wallpaperState.wallpaperButton,
        sampleElement: wallpaperState.wallpaperButton,
        minWidth: 54,
        minHeight: 54,
        iconButton: true
      });
      return targets;
    }

    function refreshWallpaperEffects() {
      if (wallpaperState.wallpaperEffects) {
        return wallpaperState.wallpaperEffects.refresh();
      }
      return Promise.resolve();
    }

    function getRuntimeAssetUrl(path) {
      const value = String(path || '').trim();
      if (!value) {
        return '';
      }
      if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        return chrome.runtime.getURL(value);
      }
      return `../../${value}`;
    }

    function getCssUrlValue(url) {
      const safe = String(url || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '')
        .replace(/\r/g, '');
      return safe ? `url("${safe}")` : 'none';
    }

    // Uploads and cached photos reach CSS as a blob URL rather than their data URL. Every style
    // recalculation re-reads the whole value of --x-nt-wallpaper-image, so a megabyte-long data URL
    // there costs ~10ms per recalc while the page builds; and Chrome drops a custom property longer
    // than 2 MB, which uploads stored before that was capped can exceed. Matches wallpaper-preload.js.
    const WALLPAPER_CSS_INLINE_URL_MAX_LENGTH = 32 * 1024;
    let wallpaperCssObjectUrl = { source: '', url: '' };

    function dataUrlToObjectUrl(dataUrl) {
      const comma = dataUrl.indexOf(',');
      const meta = dataUrl.slice(5, comma);
      const isBase64 = /;base64$/i.test(meta);
      const type = meta.replace(/;base64$/i, '') || 'application/octet-stream';
      const payload = dataUrl.slice(comma + 1);
      let bytes;
      if (isBase64 && typeof Uint8Array.fromBase64 === 'function') {
        bytes = Uint8Array.fromBase64(payload);
      } else if (isBase64) {
        const binary = windowObj.atob(payload);
        bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      }
      return windowObj.URL.createObjectURL(new windowObj.Blob([bytes], { type }));
    }

    function releaseWallpaperCssObjectUrl() {
      const previous = wallpaperCssObjectUrl.url;
      wallpaperCssObjectUrl = { source: '', url: '' };
      if (previous) {
        // A transition layer may still be fading the old image out; free it once that is done.
        windowObj.setTimeout(() => windowObj.URL.revokeObjectURL(previous),
          Math.max(WALLPAPER_VISUAL_TRANSITION_MS, WALLPAPER_FILTER_TRANSITION_MS) + 1000);
      }
    }

    function getCssSafeWallpaperUrl(url) {
      const value = String(url || '');
      if (wallpaperCssObjectUrl.source && wallpaperCssObjectUrl.source === value) {
        return wallpaperCssObjectUrl.url;
      }
      // The preload may have painted this image through its own blob URL already; keeping that URL
      // means the background never swaps to a second, still undecoded copy. Otherwise it is released
      // like any URL this page no longer shows.
      const preloaded = takePreloadedCssObjectUrl();
      if (preloaded) {
        releaseWallpaperCssObjectUrl();
        wallpaperCssObjectUrl = preloaded;
        if (preloaded.source === value) {
          return preloaded.url;
        }
      }
      const tooLong = value.startsWith('data:') && value.length > WALLPAPER_CSS_INLINE_URL_MAX_LENGTH;
      if (!tooLong || !windowObj.URL || typeof windowObj.URL.createObjectURL !== 'function') {
        releaseWallpaperCssObjectUrl();
        return value;
      }
      let objectUrl = '';
      try {
        objectUrl = dataUrlToObjectUrl(value);
      } catch (_error) {
        releaseWallpaperCssObjectUrl();
        return value;
      }
      releaseWallpaperCssObjectUrl();
      wallpaperCssObjectUrl = { source: value, url: objectUrl };
      return objectUrl;
    }

    // The preload decoded the wallpaper it painted; the first sample uses that image. Taken once, so
    // the page does not keep a full-size image alive after the wallpaper changes.
    function takePreloadedDecodedImage(url) {
      const wallpaperPreload = globalThis.LumnoNewtabWallpaperPreload;
      const decoded = wallpaperPreload && wallpaperPreload.decodedImage;
      if (!decoded) {
        return null;
      }
      wallpaperPreload.decodedImage = null;
      return decoded.url === url && decoded.ready && typeof decoded.ready.then === 'function'
        ? decoded.ready
        : null;
    }

    function takePreloadedCssObjectUrl() {
      const wallpaperPreload = globalThis.LumnoNewtabWallpaperPreload;
      const handed = wallpaperPreload && wallpaperPreload.cssObjectUrl;
      if (!handed || !handed.source || !handed.url) {
        return null;
      }
      wallpaperPreload.cssObjectUrl = null;
      return { source: String(handed.source), url: String(handed.url) };
    }

    function cacheWallpaperImageReady(url, promise) {
      if (!url || !promise) {
        return;
      }
      if (wallpaperImageReadyCache.has(url)) {
        wallpaperImageReadyCache.delete(url);
      }
      wallpaperImageReadyCache.set(url, promise);
      while (wallpaperImageReadyCache.size > WALLPAPER_IMAGE_READY_CACHE_LIMIT) {
        const firstKey = wallpaperImageReadyCache.keys().next().value;
        wallpaperImageReadyCache.delete(firstKey);
      }
    }

    function waitForWallpaperImageReady(url) {
      const imageUrl = String(url || '').trim();
      if (!imageUrl) {
        return Promise.resolve();
      }
      const cached = wallpaperImageReadyCache.get(imageUrl);
      if (cached) {
        return cached;
      }
      const isNetwork = isNetworkWallpaperImageUrl(imageUrl);
      const load = () => new Promise((resolve) => {
        const image = new Image();
        let timer = 0;
        let settled = false;
        const finish = (loaded) => {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timer);
          if (isNetwork) {
            wallpaperNetworkImageStates.set(imageUrl, loaded ? 'loaded' : 'failed');
          }
          resolve();
        };
        if (isNetwork) {
          timer = window.setTimeout(() => {
            finish(false);
            image.src = '';
          }, WALLPAPER_NETWORK_IMAGE_TIMEOUT_MS);
        }
        image.decoding = 'async';
        image.onload = () => {
          if (typeof image.decode === 'function') {
            image.decode().then(() => finish(true)).catch(() => finish(true));
            return;
          }
          finish(true);
        };
        image.onerror = () => finish(false);
        image.src = imageUrl;
      });
      const promise = isNetwork ? waitForDocumentLoad().then(load) : load();
      cacheWallpaperImageReady(imageUrl, promise);
      return promise;
    }

    // Network images start after the page has loaded, so they never hold the tab's spinner.
    function waitForDocumentLoad() {
      if (!document || typeof document.readyState !== 'string' || document.readyState === 'complete') {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        window.addEventListener('load', () => resolve(), { once: true });
      });
    }

    function createWallpaperTransitionLayer() {
      if (!document.body ||
          document.body.getAttribute('data-nt-enter') !== 'done' ||
          shouldReduceMotion()) {
        return null;
      }
      const computedStyle = window.getComputedStyle(document.body);
      const layer = document.createElement('div');
      layer.className = 'x-nt-wallpaper-transition-layer';
      layer.style.backgroundColor = computedStyle.backgroundColor;
      if (document.body.getAttribute('data-wallpaper-effect') === 'blur') {
        layer.setAttribute('data-wallpaper-effect', 'blur');
        layer.style.backgroundImage =
          computedStyle.getPropertyValue('--x-nt-wallpaper-image').trim() || 'none';
        layer.style.backgroundSize =
          computedStyle.getPropertyValue('--x-nt-wallpaper-size').trim() || 'cover';
        layer.style.backgroundPosition =
          computedStyle.getPropertyValue('--x-nt-wallpaper-position').trim() || 'center center';
        [
          '--x-nt-wallpaper-blur-overscan',
          '--x-nt-wallpaper-blur-radius',
          '--x-nt-wallpaper-blur-saturate',
          '--x-nt-wallpaper-blur-brightness',
          '--x-nt-wallpaper-blur-contrast'
        ].forEach((propertyName) => {
          const propertyValue = computedStyle.getPropertyValue(propertyName).trim();
          if (propertyValue) {
            layer.style.setProperty(propertyName, propertyValue);
          }
        });
      } else {
        layer.style.backgroundImage = computedStyle.backgroundImage;
        layer.style.backgroundSize = computedStyle.backgroundSize;
        layer.style.backgroundPosition = computedStyle.backgroundPosition;
      }
      layer.style.backgroundRepeat = computedStyle.backgroundRepeat;
      layer.style.backgroundAttachment = 'fixed';
      document.body.insertBefore(layer, document.body.firstChild);
      return layer;
    }

    function releaseWallpaperTransitionLayer(layer) {
      if (!layer || !layer.parentNode) {
        return;
      }
      window.requestAnimationFrame(() => {
        layer.setAttribute('data-exit', 'true');
        window.setTimeout(() => {
          if (layer.parentNode) {
            layer.parentNode.removeChild(layer);
          }
        }, (layer.getAttribute('data-wallpaper-filter-transition') === 'true'
          ? WALLPAPER_FILTER_TRANSITION_MS
          : WALLPAPER_VISUAL_TRANSITION_MS) + 80);
      });
    }

    function applyWallpaperVisualState(wallpaper) {
      const target = document.documentElement;
      const imageUrl = wallpaper ? getDisplayedWallpaperImageUrl(wallpaper) : '';
      const wallpaperPreload = globalThis.LumnoNewtabWallpaperPreload;
      if (wallpaperPreload && typeof wallpaperPreload === 'object') {
        // A copy the preload is still reading must not paint over the runtime's choice.
        wallpaperPreload.runtimeApplied = true;
      }
      wallpaperState.appliedWallpaperVisualUrl = imageUrl;
      wallpaperState.appliedWallpaperVisualActive = Boolean(wallpaper);
      if (target) {
        target.style.setProperty('--x-nt-wallpaper-image',
          imageUrl ? getCssUrlValue(getCssSafeWallpaperUrl(imageUrl)) : 'none');
        target.style.setProperty('--x-nt-wallpaper-size', 'cover');
        target.style.setProperty('--x-nt-wallpaper-position', 'center center');
        target.setAttribute('data-wallpaper-active', wallpaper ? 'true' : 'false');
      }
      if (document.body) {
        document.body.setAttribute('data-wallpaper-active', wallpaper ? 'true' : 'false');
      }
      if (wallpaperEffectPreload && typeof wallpaperEffectPreload.updateSource === 'function') {
        wallpaperEffectPreload.updateSource(wallpaper, imageUrl);
      }
      return imageUrl;
    }

    function runWallpaperVisualRefresh(seq) {
      if (seq !== wallpaperState.wallpaperVisualSeq) {
        return;
      }
      refreshWallpaperAdaptiveSampler();
      refreshWallpaperEffects();
    }

    function scheduleWallpaperVisualRefresh(seq) {
      if (wallpaperVisualRefreshTimer) {
        window.clearTimeout(wallpaperVisualRefreshTimer);
        wallpaperVisualRefreshTimer = 0;
      }
      wallpaperVisualRefreshTimer = window.setTimeout(() => {
        wallpaperVisualRefreshTimer = 0;
        afterNextPaint(window, () => runWallpaperVisualRefresh(seq));
      }, WALLPAPER_VISUAL_REFRESH_DELAY_MS);
    }

    return {
      clampNumber,
      getWallpaperOverlayAlphaAtViewportY,
      getWallpaperAdaptiveToneTargets,
      getRuntimeAssetUrl,
      takePreloadedDecodedImage,
      waitForWallpaperImageReady,
      waitForDocumentLoad,
      createWallpaperTransitionLayer,
      releaseWallpaperTransitionLayer,
      applyWallpaperVisualState,
      scheduleWallpaperVisualRefresh
    };
  }

  root.LumnoWallpaperRuntimeWallpaperVisual = { createWallpaperVisual };
})(globalThis);
