(function(root) {
  // The page's wallpaper: the wallpaper runtime and its panel controls, the
  // first wallpaper, overlay and effect shown at startup, and the adaptive
  // tone targets that keep text and glass surfaces readable on it.
  function createWallpaperPage(deps) {
    const {
      SETTINGS,
      shortcutTiles,
      getShortcutDockIcon,
      shortcutGroupHeaders,
      getEffectiveBookmarkTopbarSurfaceMode,
      isBookmarkTopbarMode,
      root,
      NEWTAB_GLASS_ADAPTIVE_SELECTOR,
      EXTENSION_ROUTES,
      storageArea,
      localStorageArea,
      NEWTAB_WALLPAPER_STORAGE_KEY,
      NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY,
      NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY,
      NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY,
      NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
      NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
      NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
      NEWTAB_TIME_OPACITY_STORAGE_KEY,
      NEWTAB_TIME_INK_STORAGE_KEY,
      NEWTAB_TIME_FONT_STORAGE_KEY,
      NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
      NEWTAB_TIME_12_HOUR_STORAGE_KEY,
      NEWTAB_FAVICON_STORAGE_KEY,
      NEWTAB_SEARCH_WIDTH_CONFIG,
      t,
      formatMessage,
      getSelectedThemeMode,
      getScopedThemeMode,
      getThemeScope,
      setThemeMode,
      setThemeScope,
      getRiSvg,
      showToast,
      beginToast,
      showTopActionTooltip,
      hideTopActionTooltip,
      applyWordmarkThemeAppearance,
      setNewtabTopContentMode,
      setNewtabTimeFontWeight,
      setNewtabTimeFontSize,
      setNewtabTimeOpacity,
      setNewtabTimeInk,
      setNewtabTimeFont,
      setNewtabTimeSecondsVisible,
      setNewtabTime12Hour,
      getEffectiveNewtabSearchWidth,
      setNewtabSearchWidth,
      NEWTAB_SHORTCUT_COLUMNS_MIN,
      NEWTAB_SHORTCUT_COLUMNS_MAX,
      NEWTAB_SHORTCUT_COLUMNS_DEFAULT,
      NEWTAB_SHORTCUT_SIZE_MIN,
      NEWTAB_SHORTCUT_SIZE_MAX,
      NEWTAB_SHORTCUT_SIZE_DEFAULT,
      NEWTAB_SHORTCUT_GAP_MIN,
      NEWTAB_SHORTCUT_GAP_MAX,
      NEWTAB_SHORTCUT_GAP_DEFAULT,
      setNewtabShortcutsVisible,
      setNewtabShortcutAddVisible,
      setNewtabShortcutDockMagnificationEnabled,
      setNewtabShortcutColumns,
      setNewtabShortcutSize,
      setNewtabShortcutGap,
      FEATURE_HINTS,
      newtabEntryAnimationReadyPromise,
      initialNewtabInputAutoFocusReadyTask,
      setNewtabInputAutoFocusEnabled,
      applyNewtabGlassStyle,
      NEWTAB_GLASS_STYLE_STORAGE_KEY,
      applyNewtabGlassTheme,
      NEWTAB_GLASS_THEME_STORAGE_KEY,
      bootstrapInitialThemeMode
    } = deps;

    // The page state object shared with newtab.js and the other modules.
    const pageState = deps.pageState;

    const NEWTAB_WALLPAPER = globalThis.LumnoNewtabWallpaper;
    const NEWTAB_WALLPAPER_VIEW = globalThis.LumnoNewtabWallpaperView;

    // The clock's ink when the user fixed it; '' leaves it to the wallpaper or theme.
    function getFixedTimeInk() {
      const ink = SETTINGS.normalizeNewtabTimeInk(pageState.newtabTimeInk);
      return pageState.newtabTopContentMode === 'time' && ink !== 'auto' ? ink : '';
    }

    function createWallpaperAdaptiveToneTargets() {
      const bookmarkPager = pageState.bookmarkPagerPrevButton && pageState.bookmarkPagerPrevButton.parentElement
        ? pageState.bookmarkPagerPrevButton.parentElement
        : null;
      const shortcutIconTargets = shortcutTiles.map((tile) => ({
        element: tile,
        forcedIconBackground: 'shortcut-fallback'
      }));
      if (pageState.shortcutGrid) {
        pageState.shortcutGrid.querySelectorAll('.x-nt-shortcut-group-empty').forEach((slot) => {
          shortcutIconTargets.push({ element: slot, forcedIconBackground: 'shortcut-add' });
        });
      }
      if (pageState.addShortcutButton) {
        shortcutIconTargets.push({ element: pageState.addShortcutButton, forcedIconBackground: 'shortcut-add' });
      }
      // The dock's icons read one sample over the whole row and keep one ink, so a
      // folder or the add button never flips tone against its neighbor where the
      // wallpaper under the row changes from light to dark.
      const shortcutIconSample = shortcutIconTargets.map(({ element }) => getShortcutDockIcon(element) || element);
      const shortcutToneTargets = shortcutIconTargets.map(({ element, forcedIconBackground }) => ({
        element,
        sampleElement: shortcutIconSample,
        toneGroup: 'shortcut-icons',
        minWidth: 42,
        minHeight: 42,
        iconButton: true,
        forcedIconBackground
      }));
      // A group's menu button and title placeholder fill with the header's solid tone
      // while pointed at or open.
      shortcutGroupHeaders.forEach((header) => {
        shortcutToneTargets.push({
          element: header,
          sampleElement: header.querySelector('.x-nt-shortcut-group-title') || header,
          minWidth: 112,
          minHeight: 32,
          iconButton: true
        });
      });
      const topContentSample = pageState.topContentController && typeof pageState.topContentController.getContent === 'function'
        ? (pageState.topContentController.getContent() || pageState.topContentContainer)
        : (pageState.wordmarkImageEl || pageState.topContentContainer);
      const quoteElement = pageState.quoteRuntime && pageState.quoteRuntime.element;
      const quoteSample = pageState.quoteRuntime && (pageState.quoteRuntime.textElement || quoteElement);
      // A quote at the top is the wordmark's caption: both read the wallpaper under
      // the pair and share one ink, so the line never flips against the mark above it.
      const quoteIsCaption = Boolean(quoteElement && !quoteElement.hidden &&
        quoteElement.getAttribute('data-position') === 'top' &&
        pageState.topContentContainer && pageState.topContentContainer.getAttribute('data-visible') !== 'false');
      const captionSample = quoteIsCaption ? [topContentSample, quoteSample] : null;
      return [
        {
          element: pageState.bookmarkTopbarRuntime && pageState.bookmarkTopbarRuntime.element,
          sampleElement: pageState.bookmarkTopbarRuntime && pageState.bookmarkTopbarRuntime.element,
          minWidth: 280,
          minHeight: 64,
          surface: 'topbar',
          preferOverlayPolarity: getEffectiveBookmarkTopbarSurfaceMode() === 'adaptive',
          // Without a glass style the search box and cards keep the theme's light or dark, so the
          // "match style" bar keeps it too instead of flipping over the wallpaper at the top.
          disabled: !isBookmarkTopbarMode() ||
            getEffectiveBookmarkTopbarSurfaceMode() === 'custom' ||
            (getEffectiveBookmarkTopbarSurfaceMode() === 'adaptive' &&
              !document.body.hasAttribute('data-glass-style'))
        },
        {
          element: pageState.topContentContainer,
          sampleElement: captionSample || topContentSample,
          toneGroup: captionSample ? 'top-caption' : '',
          // A clock ink the user fixed; a caption under the clock keeps the sampled one.
          ink: getFixedTimeInk(),
          minWidth: 220,
          minHeight: 72
        },
        {
          element: quoteElement,
          sampleElement: captionSample || quoteSample,
          toneGroup: captionSample ? 'top-caption' : '',
          minWidth: 160,
          minHeight: 32
        },
        // The heading link and breadcrumbs fill with the title's solid tone while pointed at.
        {
          element: pageState.bookmarkTitleWrap,
          sampleElement: pageState.bookmarkTitleWrap,
          minWidth: 112,
          minHeight: 44,
          iconButton: true
        },
        // The display-mode trigger is appended to bookmarkPager in the regular
        // section layout. Keep it on the pager's shared tone target so one
        // visual toolbar does not split into independently sampled colors.
        {
          element: bookmarkPager,
          sampleElement: bookmarkPager,
          minWidth: 92,
          minHeight: 42,
          iconButton: true
        },
        // The recent mode switch is the heading's text, so it takes the header's tone,
        // including the solid fill it shows while pointed at or open.
        {
          element: pageState.recentHeader,
          sampleElement: pageState.recentHeader,
          minWidth: 112,
          minHeight: 44,
          iconButton: true
        },
        {
          element: pageState.feedbackButton,
          sampleElement: pageState.feedbackButton,
          minWidth: 42,
          minHeight: 42,
          iconButton: true
        },
        // The dock's scrollbar sits on the wallpaper beside the cards; sample
        // only its track so a thin thumb follows the tone right under it.
        {
          element: pageState.bottomDockScroller,
          sampleElement: bottomDockScrollbarTrackArea,
          minWidth: 24,
          minHeight: 64,
          disabled: !isBottomDockScrollbarShown()
        }
      ].concat(shortcutToneTargets, createGlassToneTargets());
    }

    // Under a glass style each plate also samples the wallpaper right behind it, to set how dense its
    // tint is and how much saturation it keeps (glass-style.css reads both).
    function createGlassToneTargets() {
      if (!document.body || !document.body.hasAttribute('data-glass-style')) {
        return [];
      }
      // Plates in one row share an ink (light or dark text), so neighbors never alternate.
      const groupOf = (element) => {
        if (element.closest('.x-nt-shortcuts-section')) {
          return 'shortcuts';
        }
        if (element.closest('#_x_extension_newtab_recent_sites_2024_unique_')) {
          return 'recent';
        }
        if (element.closest('#_x_extension_newtab_bookmarks_2024_unique_')) {
          return element.matches('.x-nt-bookmark-card') ? 'bookmarks' : 'bookmarks-header';
        }
        return element === root ? 'search' : '';
      };
      // Looked up by id: this can run before the page structure further down has been created.
      const suggestionsSurface = document.getElementById('_x_extension_newtab_suggestions_surface_2026_unique_');
      const suggestionsList = document.getElementById('_x_extension_newtab_suggestions_container_2024_unique_');
      // The search stack reads as one sheet: the bar, the plate behind the results and the result rows
      // (a separate layer) share one ink and one tint, sampled over everything the open plate can
      // cover. The sample stays the same as the list opens, closes or grows with each keystroke, so the
      // tint never jumps and the plate never repaints for a new one.
      const searchStackSample = {
        getBoundingClientRect() {
          const bar = root.getBoundingClientRect();
          const reach = Number.parseFloat(suggestionsList
            ? window.getComputedStyle(suggestionsList).getPropertyValue('--x-nt-suggestions-max-height')
            : '') || 594;
          return new DOMRect(bar.left, bar.top, bar.width,
            Math.max(bar.height, Math.min(window.innerHeight - bar.top, bar.height + reach)));
        }
      };
      const targets = Array.from(document.querySelectorAll(NEWTAB_GLASS_ADAPTIVE_SELECTOR)).map((element) => ({
        element,
        sampleElement: element === root ? searchStackSample : element,
        glass: true,
        glassGroup: groupOf(element)
      }));
      [suggestionsSurface, suggestionsList].forEach((element) => {
        if (element) {
          targets.push({
            element,
            sampleElement: searchStackSample,
            glass: true,
            glassGroup: 'search',
            // The result rows' own icons and chips switch to their dark-theme styling with the ink.
            paletteSwap: element === suggestionsList
          });
        }
      });
      // A frosted bookmarks bar samples like a plate. Out of frosted it drops what this sets, since
      // the bar's other surfaces style its ink themselves.
      const bookmarksBar = document.querySelector('.x-nt-bookmarks-topbar');
      const barTakesGlass = bookmarksBar &&
        (bookmarksBar.dataset.surfaceMode === 'frosted' || bookmarksBar.dataset.surfaceMode === 'clear');
      if (barTakesGlass && bookmarksBar.dataset.visible === 'true') {
        targets.push({ element: bookmarksBar, sampleElement: bookmarksBar, glass: true, glassGroup: 'topbar' });
      } else if (bookmarksBar && bookmarksBar.hasAttribute('data-glass-ink')) {
        bookmarksBar.removeAttribute('data-glass-ink');
        bookmarksBar.style.removeProperty('--x-nt-glass-density');
        bookmarksBar.style.removeProperty('--x-nt-glass-saturate');
      }
      // Floating panels and menus take the same material and ink as the plates; flipped to light ink
      // they switch their controls to the dark palette (paletteSwap).
      document.querySelectorAll(
        '.x-nt-wallpaper-panel, ._x_extension_menu_surface_2024_unique_, .x-lumno-feature-hint, ' +
        '.x-nt-feedback-popover, .x-lumno-toast'
      ).forEach((element) => {
        targets.push({ element, sampleElement: element, glass: true, paletteSwap: true });
      });
      // A dialog samples the wallpaper under itself and sets its ink on its backdrop layer, which hands
      // it down to the dialog and its controls; the WeChat group dialog's card is in its shadow root.
      document.querySelectorAll(
        '.x-nt-shortcut-dialog-backdrop, .x-nt-recent-history-backdrop, #_x_extension_community_qr_dialog_2026_unique_'
      ).forEach((element) => {
        const dialog = element.shadowRoot
          ? element.shadowRoot.querySelector('.card')
          : element.querySelector('.x-nt-shortcut-dialog, .x-nt-recent-history-dialog');
        if (dialog) {
          targets.push({ element, sampleElement: dialog, glass: true, paletteSwap: true });
        }
      });
      return targets;
    }

    function getBottomDockScrollbarGutter() {
      return pageState.bottomDockScroller
        ? Math.max(0, pageState.bottomDockScroller.offsetWidth - pageState.bottomDockScroller.clientWidth)
        : 0;
    }

    // Overlay scrollbars (macOS) take no gutter but still show while scrolling.
    function isBottomDockScrollbarShown() {
      return Boolean(
        pageState.bottomDockScroller &&
        pageState.bottomDockScroller.scrollHeight > pageState.bottomDockScroller.clientHeight + 1
      );
    }

    const bottomDockScrollbarTrackArea = {
      getBoundingClientRect() {
        const rect = pageState.bottomDockScroller.getBoundingClientRect();
        // An overlay bar draws about 10px wide over the scroller's right edge.
        const gutter = getBottomDockScrollbarGutter() || 10;
        const endInset = Number.parseFloat(
          pageState.bottomDockScroller.style.getPropertyValue('--x-nt-bottom-dock-scrollbar-end-inset')
        ) || 0;
        const top = rect.top + 10;
        const bottom = Math.max(top, rect.bottom - Math.max(10, endInset));
        return {
          left: rect.right - gutter,
          right: rect.right,
          top,
          bottom,
          width: gutter,
          height: bottom - top
        };
      }
    };
    pageState.wallpaperRuntime = NEWTAB_WALLPAPER.createWallpaperRuntime({
      documentObj: document,
      windowObj: window,
      chromeObj: chrome,
      extensionRoutes: EXTENSION_ROUTES,
      storageArea,
      localWallpaperStorageArea: localStorageArea,
      getQuoteRuntime: () => pageState.quoteRuntime,
      getSectionPanelSettings: () => pageState.sectionPanelSettings,
      storageKeys: {
        wallpaper: NEWTAB_WALLPAPER_STORAGE_KEY,
        localWallpaper: NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY,
        overlay: NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY,
        effect: NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY,
        topContentMode: NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
        timeFontWeight: NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
        timeFontSize: NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
        timeOpacity: NEWTAB_TIME_OPACITY_STORAGE_KEY,
        timeInk: NEWTAB_TIME_INK_STORAGE_KEY,
        timeFont: NEWTAB_TIME_FONT_STORAGE_KEY,
        timeSecondsVisible: NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
        time12Hour: NEWTAB_TIME_12_HOUR_STORAGE_KEY,
        favicon: NEWTAB_FAVICON_STORAGE_KEY
      },
      searchWidthConfig: NEWTAB_SEARCH_WIDTH_CONFIG,
      t,
      formatMessage,
      getThemeMode: getSelectedThemeMode,
      getEffectiveThemeMode: getScopedThemeMode,
      getThemeScope: (...args) => getThemeScope(...args),
      getGlobalThemeMode: () => pageState.globalThemeMode,
      setThemeMode: (...args) => setThemeMode(...args),
      setThemeScope: (...args) => setThemeScope(...args),
      getRiSvg,
      showToast,
      beginToast,
      showTopActionTooltip: (...args) => showTopActionTooltip(...args),
      hideTopActionTooltip: (...args) => hideTopActionTooltip(...args),
      applyWordmarkThemeAppearance: (...args) => applyWordmarkThemeAppearance(...args),
      getTopContentMode: () => pageState.newtabTopContentMode,
      setTopContentMode: (value) => {
        setNewtabTopContentMode(value);
      },
      getTimeFontWeight: () => pageState.newtabTimeFontWeight,
      setTimeFontWeight: (...args) => setNewtabTimeFontWeight(...args),
      getTimeFontSize: () => pageState.newtabTimeFontSize,
      setTimeFontSize: (...args) => setNewtabTimeFontSize(...args),
      getTimeOpacity: () => pageState.newtabTimeOpacity,
      setTimeOpacity: (...args) => setNewtabTimeOpacity(...args),
      getTimeInk: () => pageState.newtabTimeInk,
      setTimeInk: (...args) => setNewtabTimeInk(...args),
      getTimeFont: () => pageState.newtabTimeFont,
      setTimeFont: (...args) => setNewtabTimeFont(...args),
      getTimeSecondsVisible: () => pageState.newtabTimeSecondsVisible,
      setTimeSecondsVisible: (...args) => setNewtabTimeSecondsVisible(...args),
      getTime12Hour: () => pageState.newtabTime12Hour,
      setTime12Hour: (...args) => setNewtabTime12Hour(...args),
      getSearchWidth: getEffectiveNewtabSearchWidth,
      setSearchWidth: (value, options) => {
        setNewtabSearchWidth(value, options);
      },
      shortcutColumnsConfig: {
        min: NEWTAB_SHORTCUT_COLUMNS_MIN,
        max: NEWTAB_SHORTCUT_COLUMNS_MAX,
        fallback: NEWTAB_SHORTCUT_COLUMNS_DEFAULT
      },
      shortcutSizeConfig: {
        min: NEWTAB_SHORTCUT_SIZE_MIN,
        max: NEWTAB_SHORTCUT_SIZE_MAX,
        fallback: NEWTAB_SHORTCUT_SIZE_DEFAULT
      },
      shortcutGapConfig: {
        min: NEWTAB_SHORTCUT_GAP_MIN,
        max: NEWTAB_SHORTCUT_GAP_MAX,
        fallback: NEWTAB_SHORTCUT_GAP_DEFAULT
      },
      getShortcutsVisible: () => pageState.newtabShortcutsVisible,
      setShortcutsVisible: setNewtabShortcutsVisible,
      getShortcutAddVisible: () => pageState.newtabShortcutAddVisible,
      setShortcutAddVisible: setNewtabShortcutAddVisible,
      getShortcutDockMagnificationEnabled: () => pageState.newtabShortcutDockMagnificationEnabled,
      setShortcutDockMagnificationEnabled: setNewtabShortcutDockMagnificationEnabled,
      getShortcutColumns: () => pageState.newtabShortcutColumns,
      setShortcutColumns: setNewtabShortcutColumns,
      getShortcutSize: () => pageState.newtabShortcutSize,
      setShortcutSize: setNewtabShortcutSize,
      getShortcutGap: () => pageState.newtabShortcutGap,
      setShortcutGap: setNewtabShortcutGap,
      featureHints: FEATURE_HINTS,
      featureHintVisibilityGate: newtabEntryAnimationReadyPromise,
      inputAutoFocusReady: initialNewtabInputAutoFocusReadyTask,
      getInputAutoFocusEnabled: () => pageState.newtabInputAutoFocusEnabled,
      setInputAutoFocusEnabled: setNewtabInputAutoFocusEnabled,
      getGlassStyle: () => SETTINGS.normalizeNewtabGlassStyle(document.body.getAttribute('data-glass-style')),
      setGlassStyle(value) {
        const style = SETTINGS.normalizeNewtabGlassStyle(value);
        applyNewtabGlassStyle(style);
        if (storageArea) {
          storageArea.set({ [NEWTAB_GLASS_STYLE_STORAGE_KEY]: style });
        }
      },
      getGlassTheme: () => pageState.newtabGlassTheme,
      setGlassTheme(value) {
        const theme = SETTINGS.normalizeNewtabGlassTheme(value);
        applyNewtabGlassTheme(theme);
        if (storageArea) {
          storageArea.set({ [NEWTAB_GLASS_THEME_STORAGE_KEY]: theme });
        }
      },
      getAdaptiveToneTargets: createWallpaperAdaptiveToneTargets,
      view: NEWTAB_WALLPAPER_VIEW
    });

    function updateWallpaperLanguageStrings() {
      if (pageState.wallpaperRuntime) {
        pageState.wallpaperRuntime.updateLanguageStrings();
      }
    }

    function updateWallpaperAppearanceSelectionUi() {
      if (pageState.wallpaperRuntime) {
        pageState.wallpaperRuntime.updateAppearanceSelectionUi();
      }
    }

    function bootstrapInitialWallpaper() {
      if (!pageState.wallpaperRuntime) {
        return Promise.resolve();
      }
      return bootstrapInitialThemeMode().then(() => pageState.wallpaperRuntime.bootstrapInitialWallpaper());
    }

    function bootstrapInitialWallpaperOverlay() {
      return pageState.wallpaperRuntime ? pageState.wallpaperRuntime.bootstrapInitialWallpaperOverlay() : Promise.resolve();
    }

    function bootstrapInitialWallpaperEffect() {
      return pageState.wallpaperRuntime ? pageState.wallpaperRuntime.bootstrapInitialWallpaperEffect() : Promise.resolve();
    }

    function waitForInitialWallpaperEffectVisual() {
      return pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.waitForInitialWallpaperEffectVisual === 'function'
        ? pageState.wallpaperRuntime.waitForInitialWallpaperEffectVisual()
        : Promise.resolve();
    }

    function waitForInitialWallpaperTone() {
      return pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.waitForInitialWallpaperTone === 'function'
        ? pageState.wallpaperRuntime.waitForInitialWallpaperTone()
        : Promise.resolve();
    }

    function markInitialWallpaperVisualReady() {
      if (!document.body) {
        return;
      }
      if (document.body.getAttribute('data-nt-wallpaper-ready') !== '1') {
        document.body.setAttribute('data-nt-wallpaper-ready', '1');
        pageState.wallpaperShownAt = performance.now();
        return;
      }
      // The preload revealed it already.
      const effectPreload = globalThis.LumnoNewtabWallpaperEffectPreload;
      if (!pageState.wallpaperShownAt && effectPreload && effectPreload.wallpaperShownAt) {
        pageState.wallpaperShownAt = effectPreload.wallpaperShownAt;
      }
    }

    function bootstrapInitialNewtabFavicon() {
      return pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.bootstrapInitialNewtabFavicon === 'function'
        ? pageState.wallpaperRuntime.bootstrapInitialNewtabFavicon()
        : Promise.resolve();
    }

    function createWallpaperControls() {
      if (!pageState.wallpaperRuntime) {
        return;
      }
      pageState.wallpaperRuntime.createControls();
      pageState.wallpaperControl = pageState.wallpaperRuntime.getControlElement();
    }

    function isWallpaperPanelOpen() {
      return pageState.wallpaperRuntime ? pageState.wallpaperRuntime.isPanelOpen() : false;
    }

    function closeWallpaperPanel(options) {
      if (pageState.wallpaperRuntime) {
        pageState.wallpaperRuntime.closePanel(options);
      }
    }

    function scheduleWallpaperAdaptiveToneUpdate() {
      if (pageState.wallpaperRuntime) {
        pageState.wallpaperRuntime.scheduleAdaptiveToneUpdate();
      }
    }

    return {
      getFixedTimeInk,
      updateWallpaperLanguageStrings,
      updateWallpaperAppearanceSelectionUi,
      bootstrapInitialWallpaper,
      bootstrapInitialWallpaperOverlay,
      bootstrapInitialWallpaperEffect,
      waitForInitialWallpaperEffectVisual,
      waitForInitialWallpaperTone,
      markInitialWallpaperVisualReady,
      bootstrapInitialNewtabFavicon,
      createWallpaperControls,
      isWallpaperPanelOpen,
      closeWallpaperPanel,
      scheduleWallpaperAdaptiveToneUpdate
    };
  }

  root.LumnoNewtabWallpaperPage = { createWallpaperPage };
})(globalThis);
