// @ts-nocheck
// The appearance panel's view model: the panel header, the theme, search
// and shortcut sections, each wallpaper source's tiles, effects, favicons,
// and drawing the model into the React view.
import * as LumnoCommunityLinks from '../../../domain/community-links';

function createPanelState(deps) {
  const {
    t,
    NEWTAB_FAVICON_SVG_SHADOW_PATH,
    NEWTAB_FAVICON_SVG_MAIN_PATH,
    NEWTAB_FAVICON_OPTIONS,
    getNewtabFaviconUrl,
    getRiSvg,
    SETTINGS,
    getSearchWidthSnapPoints,
    getSearchWidthPercent,
    getShortcutColumnsTickValues,
    getShortcutColumnsPercent,
    normalizeShortcutSizeValue,
    getShortcutLayoutPercent,
    shortcutSizeConfig,
    normalizeShortcutGapValue,
    shortcutGapConfig,
    getThemeScope,
    getRuntimeAssetUrl,
    getGlobalThemeMode,
    getWallpaperAppearanceModeLabel,
    getThemeMode,
    formatMessage,
    hasTopContentModeGetter,
    normalizeNewtabTopContentMode,
    getTopContentMode,
    hasTimeFontWeightGetter,
    normalizeNewtabTimeFontWeight,
    getTimeFontWeight,
    hasTimeFontGetter,
    getTimeFont,
    hasTimeSecondsVisibleGetter,
    normalizeNewtabTimeSecondsVisible,
    getTimeSecondsVisible,
    getTimeFontSize,
    getTimeOpacity,
    normalizeSearchWidthValue,
    getSearchWidth,
    getSearchWidthMin,
    getSearchWidthMax,
    formatSearchWidthValue,
    getInputAutoFocusEnabled,
    getTimeInk,
    getTime12Hour,
    getShortcutsVisible,
    getShortcutSize,
    getShortcutGap,
    getShortcutAddVisible,
    getShortcutDockMagnificationEnabled,
    normalizeShortcutColumnsValue,
    getShortcutColumns,
    getShortcutColumnsMin,
    getShortcutColumnsMax,
    getShortcutLayoutMin,
    getShortcutLayoutMax,
    getShortcutLayoutDefault,
    getWallpaperThumbnailUrl,
    getWallpaperDisplayName,
    getLinkWallpaperById,
    isLocalWallpaperLibraryFull,
    REMOTE_CONTENT,
    getWallpaperById,
    formatBingCopyright,
    getBingWallpaperLabel,
    remoteClient,
    wallpaperThumbnailCache,
    fetchCustomWallpaperFile,
    localWallpaperStore,
    warnWallpaperStoreFailure,
    getCuratedPhotoLabel,
    isCuratedDailyWallpaperActive,
    getCuratedCategoryLabel,
    getCuratedPhotoMeta,
    getCuratedTileItems,
    getWallpaperEffectPrefsForEditMode,
    getWallpaperEffectControlVisibility,
    BLOCK_PARAMETER_MAX,
    getCrtParameterPercent,
    NEWTAB_WALLPAPER_EFFECT_TYPES,
    getWallpaperEffectLabel,
    getWallpaperEffectInkToneForUi,
    NEWTAB_WALLPAPER_EFFECT_INK_TONES,
    getWallpaperEffectInkToneLabel,
    getWallpaperEffectStrengthLabel,
    getWallpaperEffectSizeLabel,
    getWallpaperEffectSpacingLabel,
    clampNumber,
    getWallpaperEffectTextureLabel,
    hasAnyWallpaperEnabled,
    getWallpaperSelectionIdForUi,
    getWallpaperTileSelectionId,
    normalizeWallpaperMode,
    NEWTAB_WALLPAPER_MODES,
    NEWTAB_WALLPAPER_MODE_DARK,
    getWallpaperModeLabel,
    NEWTAB_WALLPAPER_OPTIONS,
    getWallpaperLocalPath,
    getWallpaperOverlayOpacityForCurrentMode,
    getGlassStyle,
    getGlassTheme,
    buildNewtabFaviconState,
    options,
    animateWallpaperPanelResize,
    snapWallpaperOverlaySliderValue,
    normalizeWallpaperOverlayOpacity,
    document,
    extensionRoutes,
    chrome,
    window
  } = deps;

  // The runtime state object shared with wallpaper.ts and the other modules.
  const wallpaperState = deps.wallpaperState;

  // A closed panel is drawn again only when it next opens; meanwhile this records that its
  // drawn state is out of date.
  let wallpaperPanelDrawPending = false;
  // Per curated photo: its panel tile from the thumbnail cache, '' while it is read or downloaded,
  // or null when that failed and the tile loads from Picsum as before.
  const curatedTileThumbnails = new Map();
  // Shown while a tile is being read, so the tile does not start a Picsum request it may not need.
  const EMPTY_TILE_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const BING_RECENT_TILE_LIMIT = 6;
  const WALLPAPER_APPEARANCE_MODES = ['system', 'light', 'dark'];
  const BING_DAILY_HINT = 'A new Bing photo every day. A photo you pick while this is on stays for the rest of the day.';
  const CURATED_DAILY_HINT = 'A new photo every day from the category shown when you turn this on, ' +
    'the same on every synced device. A photo you pick stays for the rest of the day.';
  function getWallpaperButtonLabel() {
    return t('settings_tab_appearance', 'Appearance');
  }

  // ---- Appearance panel ----
  // The panel view renders from the state built here and calls back through
  // wallpaperPanelActions; this runtime owns the settings and their storage.

  function buildPanelToggle(checked, label) {
    return { checked: Boolean(checked), label };
  }

  function getSliderMarks(values, toPercent) {
    return values.map(toPercent);
  }

  // Asset URLs, icons and slider marks: fixed for the page's lifetime.
  function createWallpaperPanelModel() {
    const faviconInlineSvg = [
      '<svg viewBox="0 0 104 104" fill="none" xmlns="http://www.w3.org/2000/svg">',
      `<path opacity="var(--x-nt-favicon-shadow-opacity, 0.2)" d="${NEWTAB_FAVICON_SVG_SHADOW_PATH}" fill="currentColor"/>`,
      `<path d="${NEWTAB_FAVICON_SVG_MAIN_PATH}" fill="currentColor" fill-opacity="var(--x-nt-favicon-main-opacity, 0.5)"/>`,
      '</svg>'
    ].join('');
    const uniqueSorted = (values) => values
      .filter((value, index, array) => array.indexOf(value) === index)
      .sort((a, b) => a - b);
    return {
      appearanceOptions: WALLPAPER_APPEARANCE_MODES.map((mode) => ({ mode })),
      favicons: NEWTAB_FAVICON_OPTIONS.map((item) => ({
        id: item.id,
        inlineSvg: item.preview === 'inlineSvg' ? faviconInlineSvg : '',
        previewUrl: item.preview === 'inlineSvg' ? '' : getNewtabFaviconUrl(item)
      })),
      icons: {
        add: getRiSvg('ri-add-large-line', 'ri-size-18'),
        arrow: getRiSvg('ri-arrow-right-s-line', 'ri-size-14'),
        check: getRiSvg('ri-check-line', 'ri-size-16'),
        delete: getRiSvg('ri-close-line', 'ri-size-14'),
        refresh: getRiSvg('ri-refresh-line', 'ri-size-14'),
        info: getRiSvg('ri-information-line', 'ri-size-14'),
        restore: getRiSvg('ri-arrow-go-back-line', 'ri-size-14'),
        link: getRiSvg('ri-link', 'ri-size-18'),
        wallpaper: getRiSvg('ri-t-shirt-2-line', 'ri-size-20')
      },
      quoteFontSize: {
        min: SETTINGS.NEWTAB_QUOTE_FONT_SIZE_MIN || 12,
        max: SETTINGS.NEWTAB_QUOTE_FONT_SIZE_MAX || 24,
        defaultValue: SETTINGS.NEWTAB_QUOTE_FONT_SIZE_DEFAULT || 15
      },
      marks: {
        // One mark per snap point, so the marks show where the slider settles.
        searchWidth: getSliderMarks(getSearchWidthSnapPoints(), getSearchWidthPercent),
        shortcutColumns: getSliderMarks(getShortcutColumnsTickValues(), getShortcutColumnsPercent),
        shortcutSize: getSliderMarks(
          uniqueSorted([48, 64, 80, 96, 112].map(normalizeShortcutSizeValue)),
          (value) => getShortcutLayoutPercent(value, shortcutSizeConfig, 48, 112, 64)
        ),
        shortcutGap: getSliderMarks(
          uniqueSorted([0, 8, 16, 24].map(normalizeShortcutGapValue)),
          (value) => getShortcutLayoutPercent(value, shortcutGapConfig, 0, 24, 4)
        ),
        timeWeight: [50],
        // The default size, which the reset button returns to.
        timeSize: [getSliderMarkPercent(
          SETTINGS.NEWTAB_TIME_FONT_SIZE_DEFAULT,
          SETTINGS.NEWTAB_TIME_FONT_SIZE_MIN,
          SETTINGS.NEWTAB_TIME_FONT_SIZE_MAX
        )]
      }
    };
  }

  function getSliderMarkPercent(value, min, max) {
    return max > min ? Math.round(((value - min) / (max - min)) * 10000) / 100 : 0;
  }

  function buildWallpaperPanelHeaderState() {
    return {
      title: t('newtab_appearance_settings_title', 'Appearance settings'),
      moreSettingsLabel: t('newtab_more_settings', 'More settings'),
      moreSettingsUrl: buildAppearanceSettingsUrl(),
      helpPrompt: t('newtab_help_footer_prompt', 'Not sure what an option does?'),
      helpText: t('newtab_help_footer_action', 'Visit the Help Center'),
      helpUrl: buildHelpCenterUrl()
    };
  }

  function getWallpaperAppearancePreviewUrl(mode) {
    // Global covers every page, so it keeps the shared previews; New Tab gets miniature New Tabs.
    if (getThemeScope() !== 'home') {
      return getRuntimeAssetUrl(`assets/images/${mode}.svg`);
    }
    // Following "Global" looks like whatever Global is set to, not like following the system.
    const previewMode = mode === 'system' ? getGlobalThemeMode() : mode;
    return getRuntimeAssetUrl(`assets/images/newtab-${previewMode}.svg`);
  }

  function getWallpaperAppearanceModeLabels() {
    const labels = {};
    WALLPAPER_APPEARANCE_MODES.forEach((mode) => {
      labels[mode] = getWallpaperAppearanceModeLabel(mode);
    });
    return labels;
  }

  function buildWallpaperThemeState() {
    const scope = wallpaperState.pendingThemeScope || (getThemeScope() === 'home' ? 'home' : 'global');
    const themeMode = getThemeMode();
    // While the options slide between scopes they keep the labels they left with.
    const modeLabels = wallpaperState.heldAppearanceModeLabels || getWallpaperAppearanceModeLabels();
    return {
      title: t('settings_theme_title', 'Theme mode'),
      infoLabel: t('newtab_theme_scope_help_label', 'Theme scope info'),
      infoTooltip: t(
        'newtab_theme_scope_help',
        'Global: the default theme for all pages.\nNew Tab: applies only to the new tab page. Choose Follow "Global" to keep it in sync.'
      ),
      scope: {
        active: scope,
        label: t('newtab_theme_scope_label', 'Theme scope'),
        options: ['global', 'home'].map((value) => {
          const label = value === 'home'
            ? t('newtab_theme_scope_home', 'New Tab')
            : t('newtab_theme_scope_global', 'Global');
          return {
            value,
            label,
            ariaLabel: formatMessage(
              'newtab_theme_scope_select_label',
              'Apply theme changes to {scope}',
              { scope: label }
            )
          };
        })
      },
      modes: WALLPAPER_APPEARANCE_MODES.map((mode) => ({
        mode,
        selected: mode === themeMode,
        label: modeLabels[mode],
        imageUrl: getWallpaperAppearancePreviewUrl(mode),
        // Marks the card that hands the choice back to Lumno's global setting.
        badgeUrl: mode === 'system' && getThemeScope() === 'home'
          ? getRuntimeAssetUrl('assets/images/lumno.png')
          : '',
        ariaLabel: formatMessage('mode_switch_title', '{name}: switch to {mode} mode', {
          name: 'Lumno',
          mode: modeLabels[mode]
        })
      }))
    };
  }

  function buildWallpaperSearchState() {
    if (hasTopContentModeGetter) {
      wallpaperState.currentTopContentMode = normalizeNewtabTopContentMode(getTopContentMode());
    }
    if (hasTimeFontWeightGetter) {
      wallpaperState.currentTimeFontWeight = normalizeNewtabTimeFontWeight(getTimeFontWeight());
    }
    if (hasTimeFontGetter) {
      wallpaperState.currentTimeFont = SETTINGS.normalizeNewtabTimeFont(getTimeFont());
    }
    if (hasTimeSecondsVisibleGetter) {
      wallpaperState.currentTimeSecondsVisible = normalizeNewtabTimeSecondsVisible(getTimeSecondsVisible());
    }
    const timeFont = SETTINGS.getNewtabTimeFont(wallpaperState.currentTimeFont);
    const timeFontWeight = SETTINGS.resolveNewtabTimeFontWeight(timeFont.id, wallpaperState.currentTimeFontWeight);
    const timeFontTitle = t('newtab_time_font_title', 'Time font');
    const timeFontSize = SETTINGS.normalizeNewtabTimeFontSize(getTimeFontSize());
    const timeOpacity = SETTINGS.normalizeNewtabTimeOpacity(getTimeOpacity());
    const timeInkTitle = t('newtab_time_ink_title', 'Time color');
    const width = normalizeSearchWidthValue(getSearchWidth());
    const timeVisible = wallpaperState.currentTopContentMode === 'time';
    const autoFocusTitle = t('newtab_input_auto_focus_title', 'Automatically focus input');
    const topContentTitle = t('settings_newtab_wordmark_title', 'Content above the search bar');
    const secondsTitle = t('newtab_time_show_seconds_title', 'Show seconds');
    const twelveHourTitle = t('newtab_time_12_hour_title', '12-hour clock');
    return {
      title: t('newtab_search_section_title', 'Search box'),
      width: {
        label: t('newtab_search_width_title', 'Search box width'),
        ariaLabel: t('newtab_search_width_aria', 'Adjust New Tab search box width'),
        value: width,
        min: getSearchWidthMin(),
        max: getSearchWidthMax(),
        suffix: ' px',
        valueText: formatSearchWidthValue(width)
      },
      autoFocus: {
        title: autoFocusTitle,
        infoLabel: t('newtab_input_auto_focus_help_label', 'Input auto-focus info'),
        infoTooltip: t(
          'newtab_input_auto_focus_help',
          'If you prefer to use the browser’s native address bar, turn this option off. The extension URL will no longer appear in the address bar.'
        ),
        toggle: buildPanelToggle(getInputAutoFocusEnabled(), autoFocusTitle)
      },
      topContent: {
        title: topContentTitle,
        tabs: {
          active: wallpaperState.currentTopContentMode,
          label: topContentTitle,
          options: [
            { value: 'brand', label: t('newtab_top_content_brand', 'Brand') },
            { value: 'time', label: t('newtab_top_content_time', 'Time') },
            { value: 'off', label: t('newtab_top_content_off', 'Hide') }
          ].map((option) => Object.assign(option, { ariaLabel: option.label }))
        }
      },
      timeFont: {
        visible: timeVisible,
        title: timeFontTitle,
        ariaLabel: timeFontTitle,
        value: timeFont.id,
        options: SETTINGS.NEWTAB_TIME_FONTS.map((font) => ({ value: font.id, label: font.label }))
      },
      timeWeight: {
        visible: timeVisible,
        label: t('newtab_time_font_weight_title', 'Time font weight'),
        value: timeFontWeight,
        min: timeFont.minWeight,
        max: timeFont.maxWeight,
        resetLabel: t('newtab_time_font_weight_reset', 'Reset time font weight'),
        resetVisible: timeFontWeight !== timeFont.defaultWeight
      },
      timeSize: {
        visible: timeVisible,
        label: t('newtab_time_font_size_title', 'Time size'),
        value: timeFontSize,
        min: SETTINGS.NEWTAB_TIME_FONT_SIZE_MIN,
        max: SETTINGS.NEWTAB_TIME_FONT_SIZE_MAX,
        suffix: ' px',
        resetLabel: t('newtab_time_font_size_reset', 'Reset time size'),
        resetVisible: timeFontSize !== SETTINGS.NEWTAB_TIME_FONT_SIZE_DEFAULT
      },
      timeOpacity: {
        visible: timeVisible,
        label: t('newtab_time_opacity_title', 'Time opacity'),
        value: timeOpacity,
        min: SETTINGS.NEWTAB_TIME_OPACITY_MIN,
        max: SETTINGS.NEWTAB_TIME_OPACITY_MAX,
        suffix: '%',
        valueText: `${timeOpacity}%`,
        resetLabel: t('newtab_time_opacity_reset', 'Reset time opacity'),
        resetVisible: timeOpacity !== SETTINGS.NEWTAB_TIME_OPACITY_DEFAULT
      },
      timeInk: {
        visible: timeVisible,
        title: timeInkTitle,
        tabs: {
          active: SETTINGS.normalizeNewtabTimeInk(getTimeInk()),
          label: timeInkTitle,
          options: [
            { value: 'auto', label: t('newtab_time_ink_auto', 'Auto') },
            { value: 'light', label: t('newtab_time_ink_light', 'Light') },
            { value: 'dark', label: t('newtab_time_ink_dark', 'Dark') }
          ].map((option) => Object.assign(option, { ariaLabel: option.label }))
        }
      },
      seconds: {
        visible: timeVisible,
        title: secondsTitle,
        toggle: buildPanelToggle(wallpaperState.currentTimeSecondsVisible, secondsTitle)
      },
      twelveHour: {
        visible: timeVisible,
        title: twelveHourTitle,
        toggle: buildPanelToggle(SETTINGS.normalizeNewtabTime12Hour(getTime12Hour()), twelveHourTitle)
      }
    };
  }

  function buildWallpaperShortcutsState() {
    const enabled = Boolean(getShortcutsVisible());
    const title = t('settings_newtab_shortcuts_title', 'Shortcuts');
    const addTitle = t('settings_newtab_shortcut_add_title', 'Show “+”');
    const dockTitle = t(
      'settings_newtab_shortcut_dock_magnification_title',
      'macOS Dock-style magnification'
    );
    const size = normalizeShortcutSizeValue(getShortcutSize());
    const gap = normalizeShortcutGapValue(getShortcutGap());
    return {
      enabled,
      title,
      toggle: buildPanelToggle(enabled, title),
      add: { title: addTitle, toggle: buildPanelToggle(getShortcutAddVisible(), addTitle) },
      dock: { title: dockTitle, toggle: buildPanelToggle(getShortcutDockMagnificationEnabled(), dockTitle) },
      columns: {
        label: t('settings_newtab_shortcut_columns_title', 'Shortcuts per row'),
        value: normalizeShortcutColumnsValue(getShortcutColumns()),
        min: getShortcutColumnsMin(),
        max: getShortcutColumnsMax()
      },
      size: {
        label: t('settings_newtab_shortcut_size_title', 'Shortcut size'),
        value: size,
        min: getShortcutLayoutMin(shortcutSizeConfig, 48),
        max: getShortcutLayoutMax(shortcutSizeConfig, 48, 112),
        suffix: ' px',
        valueText: `${size} px`,
        resetLabel: t('settings_newtab_shortcut_size_reset', 'Reset shortcut size'),
        resetVisible: size !== getShortcutLayoutDefault(shortcutSizeConfig, 48, 112, 64)
      },
      gap: {
        label: t('settings_newtab_shortcut_gap_title', 'Shortcut spacing'),
        value: gap,
        min: getShortcutLayoutMin(shortcutGapConfig, 0),
        max: getShortcutLayoutMax(shortcutGapConfig, 0, 24),
        suffix: ' px',
        valueText: `${gap} px`,
        resetLabel: t('settings_newtab_shortcut_gap_reset', 'Reset shortcut spacing'),
        resetVisible: gap !== getShortcutLayoutDefault(shortcutGapConfig, 0, 24, 4)
      }
    };
  }

  function getWallpaperSelectLabel(name) {
    return formatMessage('newtab_wallpaper_select_label', 'Select {name}', { name });
  }

  function buildWallpaperTileState(item, selectedTileId) {
    return {
      id: item.id,
      thumbnailUrl: getWallpaperThumbnailUrl(item),
      selected: item.id === selectedTileId,
      label: getWallpaperSelectLabel(getWallpaperDisplayName(item))
    };
  }

  const NO_SELECTED_SOURCE = Object.freeze({ visible: false, title: '', meta: '', url: '', linkLabel: '' });

  function buildSelectedSourceState(title, meta, url) {
    return {
      visible: true,
      title,
      meta,
      url,
      linkLabel: `${title} · ${t('newtab_bing_source', 'View wallpaper source')}`
    };
  }

  function buildDailyState(toggleChecked, hint, selected) {
    const label = t('newtab_bing_daily', 'Auto-update daily');
    return {
      label,
      infoTooltip: hint,
      restoreLabel: t('newtab_daily_restore', "Back to today's wallpaper"),
      restoreVisible: Boolean(selected && selected.picked),
      toggle: buildPanelToggle(toggleChecked, label)
    };
  }

  function getLocalWallpaperItems() {
    return wallpaperState.customWallpapers.concat(wallpaperState.linkWallpapers.map((item) => getLinkWallpaperById(item.id)))
      .filter(Boolean)
      .sort((a, b) => a.updatedAt - b.updatedAt);
  }

  function buildLocalWallpaperState(label, selectedTileId) {
    const urlLabel = t('newtab_wallpaper_add_url', 'Add image link');
    return {
      label,
      deleteLabel: t('newtab_wallpaper_delete_local', 'Delete imported wallpaper'),
      upload: {
        label: t('newtab_wallpaper_add_local', 'Add local wallpaper'),
        loading: wallpaperState.customWallpaperImporting,
        full: isLocalWallpaperLibraryFull()
      },
      url: {
        open: wallpaperState.customWallpaperUrlFormOpen,
        invalid: wallpaperState.customWallpaperUrlInvalid,
        clearToken: wallpaperState.customWallpaperUrlClearToken,
        disabled: wallpaperState.customWallpaperImporting,
        tileLabel: urlLabel,
        inputLabel: urlLabel,
        placeholder: t('newtab_wallpaper_url_placeholder', 'Paste an image link (https://…)'),
        submitLabel: t('newtab_wallpaper_url_submit', 'Add')
      },
      tiles: getLocalWallpaperItems().map((item) => buildWallpaperTileState(item, selectedTileId))
    };
  }

  function buildBingWallpaperState(selectedId, selectedTileId) {
    const selected = REMOTE_CONTENT.getWallpaperProvider(selectedId) === 'bing'
      ? getWallpaperById(selectedId)
      : null;
    const busy = wallpaperState.bingLoading || wallpaperState.bingSelecting;
    // Bing skips some days, so cap the list to two full rows instead of leaving a ragged last row.
    const items = (selected && selectedId !== REMOTE_CONTENT.BING_DAILY_ID &&
      !wallpaperState.bingItems.some((item) => item.id === selectedId)
      ? [selected, ...wallpaperState.bingItems]
      : wallpaperState.bingItems).slice(0, BING_RECENT_TILE_LIMIT);
    const daily = buildDailyState(
      selectedId === REMOTE_CONTENT.BING_DAILY_ID,
      t('newtab_bing_daily_hint', BING_DAILY_HINT),
      selected
    );
    return {
      label: 'Bing',
      busy,
      loading: wallpaperState.bingLoading && !wallpaperState.bingItems.length,
      daily: Object.assign(daily, { busy: wallpaperState.bingSelecting }),
      recentLabel: t('newtab_bing_recent', 'Recent wallpapers'),
      refresh: { label: t('newtab_bing_refresh', 'Refresh'), busy: wallpaperState.bingLoading, disabled: busy },
      status: wallpaperState.bingStatus === 'loading' && !wallpaperState.bingItems.length
        ? t('newtab_bing_loading', 'Loading wallpapers…')
        : wallpaperState.bingStatus === 'error'
          ? t('newtab_bing_error', 'Could not load wallpapers. Please try again.') : '',
      selected: selected && selected.date
        ? Object.assign(buildSelectedSourceState(selected.name, formatBingCopyright(selected.copyright),
          selected.sourceUrl), {
          linkLabel: `${getBingWallpaperLabel(selected)} · ${t('newtab_bing_source', 'View wallpaper source')}`
        })
        : NO_SELECTED_SOURCE,
      tiles: items.map((item) => {
        const wallpaper = remoteClient.getWallpaper(item.id);
        const label = getBingWallpaperLabel(wallpaper);
        return {
          id: item.id,
          thumbnailUrl: getWallpaperThumbnailUrl(wallpaper),
          selected: item.id === selectedTileId,
          disabled: wallpaperState.bingSelecting,
          tooltip: label,
          label: getWallpaperSelectLabel(label)
        };
      })
    };
  }

  function getCuratedTileThumbnailUrl(item) {
    const url = getWallpaperThumbnailUrl(item);
    // A photo with a cached wallpaper copy already shows that copy's thumbnail.
    if (!wallpaperThumbnailCache || url !== item.thumbnailUrl) return url;
    const tile = curatedTileThumbnails.get(item.id);
    // The closed panel keeps its grid in the page, where a Picsum URL would load on every new tab;
    // a tile not read yet stays empty until the curated tab shows it.
    return tile === null ? url : tile || EMPTY_TILE_IMAGE;
  }

  // Tiles the curated tab shows come from this device's thumbnail cache; a tile seen for the
  // first time downloads once and is kept, so reopening the panel, even days later, asks Picsum
  // only for photos it has not shown before.
  function loadCuratedTileThumbnails(items) {
    if (!wallpaperThumbnailCache || !wallpaperState.wallpaperPanelOpen || wallpaperState.activeWallpaperTab !== 'curated') return items;
    const pending = items.filter((item) => item.thumbnailUrl && !curatedTileThumbnails.has(item.id) &&
      getWallpaperThumbnailUrl(item) === item.thumbnailUrl);
    if (!pending.length) return items;
    pending.forEach((item) => curatedTileThumbnails.set(item.id, ''));
    wallpaperThumbnailCache.readByIds(pending.map((item) => item.id)).catch(() => []).then((records) => {
      const stored = new Map(records.filter((record) => record && record.dataUrl)
        .map((record) => [record.id, record]));
      pending.forEach((item) => {
        const record = stored.get(item.id);
        if (record && record.url === item.thumbnailUrl) {
          curatedTileThumbnails.set(item.id, record.dataUrl);
        } else {
          downloadCuratedTileThumbnail(item);
        }
      });
      renderWallpaperPanelState();
    });
    return items;
  }

  function downloadCuratedTileThumbnail(item) {
    fetchCustomWallpaperFile(item.thumbnailUrl)
      .then((file) => localWallpaperStore.buildTileThumbnail(file))
      .then((dataUrl) => {
        curatedTileThumbnails.set(item.id, dataUrl);
        wallpaperThumbnailCache.write({ id: item.id, url: item.thumbnailUrl, dataUrl })
          .catch(warnWallpaperStoreFailure('Could not cache a wallpaper thumbnail.'));
      }, () => {
        curatedTileThumbnails.set(item.id, null);
      })
      .then(() => renderWallpaperPanelState());
  }

  function buildCuratedWallpaperState(label, selectedId, selectedTileId) {
    const selected = REMOTE_CONTENT.getWallpaperProvider(selectedId) === 'curated'
      ? getWallpaperById(selectedId)
      : null;
    const categoryLabel = t('newtab_curated_category', 'Category');
    const photoLabel = selected && selected.imageUrl ? getCuratedPhotoLabel(selected) : '';
    return {
      label,
      daily: buildDailyState(
        isCuratedDailyWallpaperActive(),
        t('newtab_curated_daily_hint', CURATED_DAILY_HINT),
        selected
      ),
      category: {
        label: categoryLabel,
        tabs: {
          active: wallpaperState.curatedCategory,
          label: categoryLabel,
          options: REMOTE_CONTENT.CURATED_CATEGORIES.map((value) => ({
            value,
            label: getCuratedCategoryLabel(value)
          }))
        }
      },
      listLabel: t('newtab_curated_list', 'Photos'),
      mix: buildCuratedMixState(),
      refreshLabel: t('newtab_curated_more', 'Show others'),
      selected: photoLabel
        ? buildSelectedSourceState(photoLabel, getCuratedPhotoMeta(selected), selected.sourceUrl)
        : NO_SELECTED_SOURCE,
      tiles: loadCuratedTileThumbnails(getCuratedTileItems()).map((item) => {
        const wallpaper = remoteClient.getWallpaper(item.id);
        const tileLabel = [getCuratedPhotoLabel(wallpaper), wallpaper && wallpaper.title ? wallpaper.name : '']
          .filter(Boolean)
          .join(' · ');
        return {
          id: item.id,
          thumbnailUrl: getCuratedTileThumbnailUrl(item),
          selected: item.id === selectedTileId,
          tooltip: tileLabel,
          label: getWallpaperSelectLabel(tileLabel)
        };
      })
    };
  }

  // Shown on the random tab only: which categories the mix, and its daily photo, draw from.
  function buildCuratedMixState() {
    const included = REMOTE_CONTENT.getRandomMixCategories();
    const categories = REMOTE_CONTENT.CURATED_CATEGORIES.filter((value) => value !== REMOTE_CONTENT.RANDOM_CATEGORY);
    const names = included.map(getCuratedCategoryLabel);
    let label = t('newtab_curated_mix_all', 'All categories');
    if (included.length < categories.length) {
      label = included.length <= 2
        ? names.join(t('newtab_curated_mix_separator', ', '))
        : formatMessage('newtab_curated_mix_count', '{count} categories', { count: included.length });
    }
    return {
      visible: wallpaperState.curatedCategory === REMOTE_CONTENT.RANDOM_CATEGORY,
      label,
      ariaLabel: t('newtab_curated_mix_aria', 'Categories in the mix'),
      options: categories.map((value) => {
        const checked = included.includes(value);
        return {
          value,
          label: getCuratedCategoryLabel(value),
          checkbox: true,
          checked,
          // The mix keeps at least one category.
          disabled: checked && included.length === 1
        };
      })
    };
  }

  function buildWallpaperEffectSliderState(labelInfo, value, visible, max, percent) {
    const number = Number(value);
    const normalizedValue = Number.isFinite(number) ? number : 0;
    return {
      label: t(labelInfo.labelKey, labelInfo.fallback),
      value: normalizedValue,
      min: 0,
      max,
      visible,
      disabled: !visible,
      suffix: percent ? '%' : '',
      valueText: percent ? `${normalizedValue}%` : String(normalizedValue)
    };
  }

  function buildWallpaperEffectState() {
    const prefs = getWallpaperEffectPrefsForEditMode();
    const visibility = getWallpaperEffectControlVisibility(prefs);
    const title = t('newtab_wallpaper_effect_title', 'Wallpaper filter');
    const inkTitle = t('newtab_wallpaper_effect_ink_title', 'Sample tones');
    const blockMax = prefs.type === 'blocks' ? BLOCK_PARAMETER_MAX : 100;
    const crtSlider = (key, labelKey, fallback) => buildWallpaperEffectSliderState(
      { labelKey, fallback },
      getCrtParameterPercent(key, prefs[key]),
      visibility[key],
      100,
      true
    );
    return {
      label: title,
      select: {
        ariaLabel: title,
        value: prefs.type,
        options: NEWTAB_WALLPAPER_EFFECT_TYPES.map((item) => ({
          value: item.type,
          label: getWallpaperEffectLabel(item.type)
        }))
      },
      inkTone: {
        visible: visibility.inkTone,
        label: inkTitle,
        tabs: {
          active: getWallpaperEffectInkToneForUi(prefs),
          label: inkTitle,
          options: NEWTAB_WALLPAPER_EFFECT_INK_TONES.map((item) => {
            const label = getWallpaperEffectInkToneLabel(item.tone);
            return {
              value: item.tone,
              label,
              ariaLabel: formatMessage(
                'newtab_wallpaper_effect_ink_select_label',
                'Sample {tone} for dots or characters',
                { tone: label }
              )
            };
          })
        }
      },
      sliders: {
        strength: buildWallpaperEffectSliderState(
          getWallpaperEffectStrengthLabel(prefs),
          prefs.type === 'crt' ? getCrtParameterPercent('crtStrength', prefs.crtStrength) : prefs.strength,
          visibility.strength,
          100,
          prefs.type === 'crt'
        ),
        size: buildWallpaperEffectSliderState(
          getWallpaperEffectSizeLabel(prefs),
          prefs.type === 'blocks' ? prefs.blockSize : prefs.size,
          visibility.size,
          blockMax,
          false
        ),
        spacing: buildWallpaperEffectSliderState(
          getWallpaperEffectSpacingLabel(prefs),
          Math.round(clampNumber(prefs.spacing, 0, prefs.type === 'blocks' ? 5 : 100)),
          visibility.spacing,
          blockMax,
          true
        ),
        texture: buildWallpaperEffectSliderState(
          getWallpaperEffectTextureLabel(),
          prefs.texture,
          visibility.texture,
          100,
          false
        ),
        crtBloom: crtSlider('crtBloom', 'newtab_wallpaper_effect_crt_bloom', 'Bloom'),
        crtRgbOffset: crtSlider('crtRgbOffset', 'newtab_wallpaper_effect_crt_rgb_offset', 'RGB offset'),
        crtCurvature: crtSlider('crtCurvature', 'newtab_wallpaper_effect_crt_curvature', 'Screen curvature')
      }
    };
  }

  function buildWallpaperSectionState() {
    const enabled = hasAnyWallpaperEnabled();
    const selectedId = getWallpaperSelectionIdForUi();
    const selectedTileId = getWallpaperTileSelectionId(selectedId);
    const split = Boolean(wallpaperState.currentWallpaperPrefs && wallpaperState.currentWallpaperPrefs.sameForModes === false);
    const builtInLabel = t('newtab_wallpaper_builtin_section', 'Built-in');
    const localLabel = t('newtab_wallpaper_local_section', 'Local');
    const curatedLabel = t('newtab_wallpaper_curated_section', 'Curated');
    const sourceLabel = t('newtab_wallpaper_source_title', 'Source');
    return {
      title: t('newtab_wallpaper_title', 'Wallpaper'),
      enabled,
      toggle: buildPanelToggle(enabled, t('newtab_wallpaper_toggle_label', 'Toggle wallpaper')),
      activeTab: wallpaperState.activeWallpaperTab,
      modeSync: {
        title: t('newtab_wallpaper_mode_sync_title', 'Match light and dark mode'),
        toggle: buildPanelToggle(
          !split,
          t('newtab_wallpaper_mode_sync_toggle_label', 'Use the same wallpaper for light and dark mode')
        )
      },
      mode: {
        visible: split,
        label: t('newtab_wallpaper_mode_row_title', 'Mode'),
        tabs: {
          active: normalizeWallpaperMode(wallpaperState.activeWallpaperMode),
          label: t('newtab_wallpaper_mode_tabs_label', 'Wallpaper color mode'),
          options: NEWTAB_WALLPAPER_MODES.map((mode) => ({
            value: mode,
            label: mode === NEWTAB_WALLPAPER_MODE_DARK
              ? t('newtab_wallpaper_dark_mode_tab', 'Dark')
              : t('newtab_wallpaper_light_mode_tab', 'Light'),
            ariaLabel: formatMessage(
              'newtab_wallpaper_mode_select_label',
              'Edit {mode} wallpaper',
              { mode: getWallpaperModeLabel(mode) }
            )
          }))
        }
      },
      source: {
        label: sourceLabel,
        tabs: {
          active: wallpaperState.activeWallpaperTab,
          label: sourceLabel,
          options: [
            { value: 'built-in', label: builtInLabel },
            { value: 'local', label: localLabel },
            { value: 'bing', label: 'Bing' },
            { value: 'curated', label: curatedLabel }
          ].map((option) => Object.assign(option, { ariaLabel: option.label }))
        }
      },
      builtIn: {
        label: builtInLabel,
        tiles: NEWTAB_WALLPAPER_OPTIONS.map((item) => Object.assign(
          buildWallpaperTileState(item, selectedTileId),
          { path: getWallpaperLocalPath(item) }
        ))
      },
      local: buildLocalWallpaperState(localLabel, selectedTileId),
      bing: buildBingWallpaperState(selectedId, selectedTileId),
      curated: buildCuratedWallpaperState(curatedLabel, selectedId, selectedTileId),
      overlay: {
        label: t('newtab_wallpaper_overlay_opacity', 'Mask effect'),
        value: getWallpaperOverlayOpacityForCurrentMode(),
        min: 0,
        max: 100
      },
      effect: buildWallpaperEffectState()
    };
  }

  function buildWallpaperPanelState() {
    const glassStyleValue = getGlassStyle();
    const glassThemeTitle = t('settings_newtab_glass_theme_title', 'Material theme');
    return {
      actions: wallpaperState.wallpaperPanelActions,
      open: wallpaperState.wallpaperPanelOpen,
      panelLabel: t('settings_tab_appearance', 'Appearance'),
      button: { active: Boolean(wallpaperState.currentWallpaperId), label: getWallpaperButtonLabel() },
      header: buildWallpaperPanelHeaderState(),
      theme: buildWallpaperThemeState(),
      glassStyle: {
        sectionTitle: t('newtab_style_section_title', 'Style'),
        title: t('settings_newtab_glass_style_title', 'Material'),
        infoTooltip: t('settings_newtab_glass_style_desc', 'Change the material of New Tab UI elements.'),
        ariaLabel: t('settings_newtab_glass_style_title', 'Material'),
        value: glassStyleValue,
        options: [
          { value: 'none', label: t('settings_newtab_glass_style_none', 'Default') },
          { value: 'frosted', label: t('settings_newtab_glass_style_frosted', 'Frosted glass'), badge: 'Beta' },
          { value: 'liquid', label: t('settings_newtab_glass_style_liquid', 'Liquid glass'), badge: 'Beta' }
        ],
        theme: {
          visible: glassStyleValue !== 'none',
          title: glassThemeTitle,
          tabs: {
            active: SETTINGS.normalizeNewtabGlassTheme(getGlassTheme()),
            label: glassThemeTitle,
            options: [
              { value: 'follow', label: t('settings_newtab_glass_theme_follow', 'Auto') },
              { value: 'light', label: t('settings_newtab_glass_theme_light', 'Light') },
              { value: 'dark', label: t('settings_newtab_glass_theme_dark', 'Dark') }
            ].map((option) => Object.assign(option, { ariaLabel: option.label }))
          }
        }
      },
      search: buildWallpaperSearchState(),
      shortcuts: buildWallpaperShortcutsState(),
      quote: {
        infoTooltip: getQuoteProviderLabel(),
        library: {
          title: t('newtab_quote_library', 'Quote collection'),
          shuffleLabel: t('newtab_quote_shuffle_button', 'Shuffle'),
          infoTooltip: t('newtab_quote_import_hint', 'TXT / MD: one non-empty content line per quote. Up to 1 MB, 1,000 quotes, 500 characters each; kept on this device, not in browser sync; WebDAV syncs it when turned on.')
        }
      },
      wallpaper: buildWallpaperSectionState(),
      favicon: buildNewtabFaviconState()
    };
  }

  function getQuoteProviderLabel() {
    const quoteRuntime = options.getQuoteRuntime && options.getQuoteRuntime();
    return (quoteRuntime && typeof quoteRuntime.getProviderLabel === 'function' &&
      quoteRuntime.getProviderLabel()) || t('newtab_quote_provider', 'Powered by Hitokoto');
  }

  // What changes the panel's height: a change here animates the resize.
  function getWallpaperPanelLayoutKey(state) {
    const wallpaper = state.wallpaper;
    return JSON.stringify([
      wallpaper.activeTab,
      wallpaper.mode.visible ? wallpaper.mode.tabs.active : '',
      wallpaper.local.tiles.length,
      wallpaper.curated.category.tabs.active
    ]);
  }

  // Rebuilds the panel state and renders it; while the panel is open the DOM is current when
  // this returns. A closed panel waits for its next open, and only its button, which stays on
  // the page, follows the state at once: the New Tab start-up changes the state many times,
  // and drawing the whole hidden panel for each change held the page back.
  function renderWallpaperPanelState() {
    if (!wallpaperState.wallpaperViewController) {
      return;
    }
    if (!wallpaperState.wallpaperPanelOpen) {
      wallpaperPanelDrawPending = true;
      syncClosedWallpaperButton();
      return;
    }
    drawWallpaperPanelState();
  }

  // The button's attributes as the view draws them; React leaves an attribute alone while its
  // value matches the last render, so the DOM set here stays right until the next draw.
  function syncClosedWallpaperButton() {
    if (!wallpaperState.wallpaperButton) {
      return;
    }
    const label = getWallpaperButtonLabel();
    const active = wallpaperState.currentWallpaperId ? 'true' : 'false';
    if (label) {
      wallpaperState.wallpaperButton.setAttribute('aria-label', label);
    } else {
      wallpaperState.wallpaperButton.removeAttribute('aria-label');
    }
    wallpaperState.wallpaperButton.setAttribute('aria-pressed', active);
    wallpaperState.wallpaperButton.setAttribute('data-active', active);
  }

  function drawWallpaperPanelState() {
    const previous = wallpaperPanelDrawPending ? null : wallpaperState.wallpaperPanelState;
    wallpaperPanelDrawPending = false;
    const state = buildWallpaperPanelState();
    const layoutKey = getWallpaperPanelLayoutKey(state);
    const layoutChanged = Boolean(previous) && layoutKey !== wallpaperState.wallpaperPanelLayoutKey;
    wallpaperState.wallpaperPanelState = state;
    wallpaperState.wallpaperPanelLayoutKey = layoutKey;
    // Rows that show or hide (mode, link form, effect controls) animate their own height
    // through .x-nt-panel-collapsible.
    const apply = () => wallpaperState.wallpaperViewController.render(state);
    if (layoutChanged) {
      animateWallpaperPanelResize(apply);
      return;
    }
    apply();
  }

  function getWallpaperPanelRefs() {
    return wallpaperState.wallpaperViewController ? wallpaperState.wallpaperViewController.getRefs() : {};
  }

  function isWallpaperTileSelected(id) {
    return getWallpaperTileSelectionId(getWallpaperSelectionIdForUi()) === id;
  }

  // Overlay and filter sliders snap to their marks while dragged.
  function getWallpaperStyleSliderValue(value, fallbackValue, change, snap) {
    return change && change.dragging && snap
      ? snapWallpaperOverlaySliderValue(value)
      : normalizeWallpaperOverlayOpacity(value, fallbackValue);
  }
  // The wallpaper article opens with how this panel works, so it is the panel's help page.
  function buildHelpCenterUrl() {
    const communityLinks = LumnoCommunityLinks;
    if (!communityLinks || typeof communityLinks.getHelpUrl !== 'function') {
      return '';
    }
    const htmlLang = document.documentElement && document.documentElement.lang;
    return communityLinks.getHelpUrl(htmlLang, 'newtab-wallpaper');
  }

  function buildAppearanceSettingsUrl() {
    if (extensionRoutes && typeof extensionRoutes.buildOptionsUrl === 'function') {
      return extensionRoutes.buildOptionsUrl(chrome, 'appearance');
    }
    if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      return `${chrome.runtime.getURL('src/options/options.html')}#appearance`;
    }
    try {
      return new URL('../options/options.html#appearance', document.baseURI || window.location.href).toString();
    } catch (e) {
      return '../options/options.html#appearance';
    }
  }

  return {
    getWallpaperButtonLabel,
    createWallpaperPanelModel,
    getWallpaperAppearanceModeLabels,
    buildWallpaperPanelState,
    getWallpaperPanelLayoutKey,
    renderWallpaperPanelState,
    drawWallpaperPanelState,
    getWallpaperPanelRefs,
    isWallpaperTileSelected,
    getWallpaperStyleSliderValue
  };
}

export { createPanelState };
