import * as LumnoShortcutDisplay from '../shortcut-display.js';
import * as LumnoCursorTooltip from '../ui/cursor-tooltip.js';
import * as LumnoMenuSurface from '../ui/menu-surface.js';
import * as INPUT_MODE_CONTROLLER_DOM from './input-mode/controller-dom.js';
import * as INPUT_MODE_MODE_MENU_ICONS from './input-mode/mode-menu-icons.js';
import * as INPUT_MODE_MODE_MENU_LANGUAGE from './input-mode/mode-menu-language.js';
import * as INPUT_MODE_MODE_MENU_LAYOUT from './input-mode/mode-menu-layout.js';
import * as INPUT_MODE_MODE_MENU_LIFECYCLE from './input-mode/mode-menu-lifecycle.js';
import * as INPUT_MODE_MODE_MENU_NAVIGATION from './input-mode/mode-menu-navigation.js';
import * as INPUT_MODE_MODE_MENU_RENDER from './input-mode/mode-menu-render.js';
import * as INPUT_MODE_MODE_MENU_SEARCH from './input-mode/mode-menu-search.js';
import * as INPUT_MODE_MODE_TAB_KEYS from './input-mode/mode-tab-keys.js';
import * as INPUT_MODE_PREFIX_CONTENT from './input-mode/prefix-content.js';
import * as INPUT_MODE_PREFIX_MOTION from './input-mode/prefix-motion.js';
import * as INPUT_MODE_PREFIX_TEXT from './input-mode/prefix-text.js';
import * as INPUT_MODE_PREFIX_VISUAL from './input-mode/prefix-visual.js';

// The shared text stack: tokens.css defines it for New Tab and onboarding,
// and focus search's overlay panel defines it and swaps in the chosen font.
const INPUT_FONT_STACK = 'var(--lumno-font-sans, sans-serif)';
const DEFAULT_ACCENT_RGB = [59, 130, 246];
const DEFAULT_PREFIX_GAP = 8;
const DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION = 700;
const DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION = 2200;
const DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET = 24;
const DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT = 44;
const DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT = 16;
const DEFAULT_PREFIX_ICON_POP_DURATION = 180;
const DEFAULT_PREFIX_ICON_POP_EASING = 'linear';
const DEFAULT_PREFIX_ICON_EXIT_DURATION = 100;
const DEFAULT_PREFIX_ICON_EXIT_EASING = 'cubic-bezier(0.4, 0, 1, 1)';
const DEFAULT_PREFIX_RESIZE_DURATION = 140;
const DEFAULT_PREFIX_RESIZE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const DEFAULT_PREFIX_ITEM_GAP_PX = 6;
const DEFAULT_PREFIX_ENTER_DURATION = 180;
const DEFAULT_PREFIX_ENTER_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const DEFAULT_PREFIX_TRANSITION = 'background-color 140ms ease, color 140ms ease';
const MIN_PREFIX_TEXT_CONTRAST = 4.5;
const MODE_MENU_LINE_ICON_PATHS = Object.freeze({
  bookmark: ['M18 7v14l-6-4l-6 4V7a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4'],
  browser: ['M4 8h16M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm4-2v4'],
  history: ['M12 8v4l2 2', 'M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5'],
  star: ['m12 17.75l-6.172 3.245l1.179-6.873l-5-4.867l6.9-1l3.086-6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z']
});
const MODE_MENU_PINYIN_FALLBACKS = Object.freeze({
  书: 'shu',
  信: 'xin',
  元: 'yuan',
  众: 'zhong',
  包: 'bao',
  千: 'qian',
  历: 'li',
  号: 'hao',
  天: 'tian',
  常: 'chang',
  已: 'yi',
  开: 'kai',
  微: 'wei',
  打: 'da',
  搜: 'sou',
  掘: 'jue',
  标: 'biao',
  淘: 'tao',
  猫: 'mao',
  用: 'yong',
  百: 'bai',
  知: 'zhi',
  签: 'qian',
  索: 'suo',
  维: 'wei',
  翻: 'fan',
  豆: 'dou',
  金: 'jin',
  问: 'wen',
  页: 'ye',
  度: 'du',
  乎: 'hu',
  瓣: 'ban',
  公: 'gong',
  基: 'ji',
  科: 'ke',
  史: 'shi'
});

function getModeMenuLineIconPaths(iconName) {
  return Object.prototype.hasOwnProperty.call(
    MODE_MENU_LINE_ICON_PATHS,
    iconName
  ) ? MODE_MENU_LINE_ICON_PATHS[iconName] : null;
}

function noopTranslate(element) {
  return element;
}

function getDocument(options) {
  return options.document || globalThis.document;
}

function getWindow(options) {
  return options.windowObj || globalThis.window || globalThis;
}

function priorityFor(useImportantStyles) {
  return useImportantStyles ? 'important' : '';
}

function declaration(property, value, useImportantStyles) {
  return `      ${property}: ${value}${useImportantStyles ? ' !important' : ''};`;
}

function cssText(pairs, useImportantStyles) {
  return `\n${pairs.map((pair) => declaration(pair[0], pair[1], useImportantStyles)).join('\n')}\n    `;
}

function setStyle(element, property, value, useImportantStyles) {
  if (!element || !element.style) {
    return;
  }
  element.style.setProperty(property, value, priorityFor(useImportantStyles));
}

function removeStyle(element, property) {
  if (!element || !element.style) {
    return;
  }
  if (typeof element.style.removeProperty === 'function') {
    element.style.removeProperty(property);
    return;
  }
  if (typeof element.style.setProperty === 'function') {
    element.style.setProperty(property, '');
  }
}

function isElementVisible(element) {
  if (!element) {
    return false;
  }
  if (typeof element.getAttribute === 'function') {
    const visibleState = element.getAttribute('data-visible');
    if (visibleState === 'true') {
      return true;
    }
    if (visibleState === 'false') {
      return false;
    }
  }
  return Boolean(
    element.style &&
    element.style.getPropertyValue('display') !== 'none'
  );
}

function defaultRgbToCss(rgb) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function defaultParseCssColor(color) {
  if (!color || typeof color !== 'string') {
    return null;
  }
  const trimmed = color.trim().toLowerCase();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return [r, g, b].every((value) => Number.isFinite(value)) ? [r, g, b] : null;
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b].every((value) => Number.isFinite(value)) ? [r, g, b] : null;
    }
    return null;
  }
  const rgbMatch = trimmed.match(/^rgb\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)$/);
  if (!rgbMatch) {
    return null;
  }
  const rgb = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  return rgb.every((value) => Number.isFinite(value)) ? rgb : null;
}

function mixRgb(source, target, targetWeight) {
  const weight = Math.min(1, Math.max(0, Number(targetWeight) || 0));
  return [0, 1, 2].map((index) => {
    const sourceValue = Number(source && source[index]);
    const targetValue = Number(target && target[index]);
    const from = Number.isFinite(sourceValue) ? sourceValue : DEFAULT_ACCENT_RGB[index];
    const to = Number.isFinite(targetValue) ? targetValue : from;
    return Math.round(from + ((to - from) * weight));
  });
}

function getRelativeLuminance(rgb) {
  const channels = [0, 1, 2].map((index) => {
    const value = Math.min(255, Math.max(0, Number(rgb && rgb[index]) || 0)) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function getContrastRatio(firstRgb, secondRgb) {
  const firstLuminance = getRelativeLuminance(firstRgb);
  const secondLuminance = getRelativeLuminance(secondRgb);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function getReadableTextColor(backgroundRgb) {
  const darkText = [17, 24, 39];
  const lightText = [248, 250, 252];
  const darkContrast = getContrastRatio(darkText, backgroundRgb);
  const lightContrast = getContrastRatio(lightText, backgroundRgb);
  return darkContrast >= lightContrast ? '#111827' : '#F8FAFC';
}

function getAccessibleThemeColorRgb(accentRgb, backgroundRgb, minimumContrast) {
  const darkTarget = [15, 23, 42];
  const lightTarget = [248, 250, 252];
  const requiredContrast = Number(minimumContrast) || MIN_PREFIX_TEXT_CONTRAST;
  if (getContrastRatio(accentRgb, backgroundRgb) >= requiredContrast) {
    return accentRgb.slice();
  }
  const target = getContrastRatio(darkTarget, backgroundRgb) >=
    getContrastRatio(lightTarget, backgroundRgb)
    ? darkTarget
    : lightTarget;
  let lowerWeight = 0;
  let upperWeight = 1;
  let readableColor = target.slice();
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const weight = (lowerWeight + upperWeight) / 2;
    const candidate = mixRgb(accentRgb, target, weight);
    if (getContrastRatio(candidate, backgroundRgb) >= requiredContrast) {
      readableColor = candidate;
      upperWeight = weight;
    } else {
      lowerWeight = weight;
    }
  }
  return readableColor;
}

function getAccessibleThemeTextRgb(accentRgb, backgroundRgb) {
  return getAccessibleThemeColorRgb(
    accentRgb,
    backgroundRgb,
    MIN_PREFIX_TEXT_CONTRAST
  );
}

function getAccessibleThemeFocusRingRgb(accentRgb, backgroundRgb) {
  return getAccessibleThemeColorRgb(accentRgb, backgroundRgb, 3);
}

function createInputModeController(parts, options) {
  // Controller state shared with the parts of this controller in
  // search/input-mode/: each receives this one object as `inputModeState`
  // and reads and writes the same properties this function does.
  const inputModeState = {};
  const config = options || {};
  const doc = getDocument(config);
  const win = getWindow(config);
  if (!doc || !parts || !parts.container || !parts.input) {
    throw new Error('createInputModeController requires input parts');
  }

  const input = parts.input;
  const container = parts.container;
  const surface = config.surface === 'overlay' ? 'overlay' : 'newtab';
  const useImportantStyles = Boolean(config.useImportantStyles);
  const applyNoTranslate = typeof config.applyNoTranslate === 'function'
    ? config.applyNoTranslate
    : noopTranslate;
  const setInputStyle = typeof config.setInputStyle === 'function'
    ? config.setInputStyle
    : (target, property, value) => setStyle(target, property, value, useImportantStyles);
  const formatMessage = typeof config.formatMessage === 'function'
    ? config.formatMessage
    : (key, fallback, values) => String(fallback || '').replace(/\{([^}]+)\}/g, (match, token) => {
      return values && Object.prototype.hasOwnProperty.call(values, token)
        ? String(values[token])
        : match;
    });
  const getThemeForMode = typeof config.getThemeForMode === 'function'
    ? config.getThemeForMode
    : (theme) => theme || config.defaultTheme || {};
  const getSiteSearchPrefixText = typeof config.getSiteSearchPrefixText === 'function'
    ? config.getSiteSearchPrefixText
    : (provider) => provider && (provider.name || provider.key) ? (provider.name || provider.key) : '';
  const getSiteSearchDisplayName = typeof config.getSiteSearchDisplayName === 'function'
    ? config.getSiteSearchDisplayName
    : getSiteSearchPrefixText;
  const getProviderIcon = typeof config.getProviderIcon === 'function'
    ? config.getProviderIcon
    : () => '';
  const resolveProviderIconUrl = typeof config.resolveProviderIconUrl === 'function'
    ? config.resolveProviderIconUrl
    : (_provider, iconUrl) => iconUrl;
  const getProviderThemeHost = typeof config.getProviderThemeHost === 'function'
    ? config.getProviderThemeHost
    : () => '';
  const getThemeForProvider = typeof config.getThemeForProvider === 'function'
    ? config.getThemeForProvider
    : null;
  const isAiSiteSearchProvider = typeof config.isAiSiteSearchProvider === 'function'
    ? config.isAiSiteSearchProvider
    : () => false;
  const attachFaviconData = typeof config.attachFaviconData === 'function'
    ? config.attachFaviconData
    : null;
  const attachProviderIcon = typeof config.attachProviderIcon === 'function'
    ? config.attachProviderIcon
    : null;
  const preferDirectProviderIcons = config.preferDirectProviderIcons === true;
  const isDarkMode = typeof config.isDarkMode === 'function'
    ? config.isDarkMode
    : () => false;
  const parseCssColor = typeof config.parseCssColor === 'function'
    ? config.parseCssColor
    : defaultParseCssColor;
  const rgbToCss = typeof config.rgbToCss === 'function'
    ? config.rgbToCss
    : defaultRgbToCss;
  const defaultTheme = config.defaultTheme || {};
  const menuSurface = LumnoMenuSurface;
  const menuSurfaceClass = menuSurface.className || '_x_extension_menu_surface_2024_unique_';
  const cursorTooltipApi = LumnoCursorTooltip;
  const shortcutDisplayApi = LumnoShortcutDisplay;
  const defaultAccentColor = Array.isArray(config.defaultAccentColor)
    ? config.defaultAccentColor
    : DEFAULT_ACCENT_RGB;
  const prefixGap = Number.isFinite(Number(config.prefixGap))
    ? Number(config.prefixGap)
    : DEFAULT_PREFIX_GAP;
  const rightReserveBase = Number.isFinite(Number(config.rightReserveBase))
    ? Number(config.rightReserveBase)
    : (surface === 'overlay' ? 92 : 64);
  const rightAnchorOffset = Number.isFinite(Number(config.rightAnchorOffset))
    ? Number(config.rightAnchorOffset)
    : (surface === 'overlay' ? 86 : 52);
  // Extra width taken by optional right-side actions (e.g. a clear button) shown beside the base icon.
  const getExtraRightInset = typeof config.getExtraRightInset === 'function'
    ? () => {
      const extra = Number(config.getExtraRightInset());
      return Number.isFinite(extra) && extra > 0 ? extra : 0;
    }
    : null;
  const configuredBaseInputPaddingLeft = Number.isFinite(Number(config.baseInputPaddingLeft))
    ? Number(config.baseInputPaddingLeft)
    : null;
  const prefixTransition = config.prefixTransition || DEFAULT_PREFIX_TRANSITION;
  const defaultPlaceholder = Object.prototype.hasOwnProperty.call(config, 'defaultPlaceholder')
    ? config.defaultPlaceholder
    : input.placeholder;
  const getDefaultPlaceholder = typeof config.getDefaultPlaceholder === 'function'
    ? config.getDefaultPlaceholder
    : () => defaultPlaceholder;
  const defaultCaretColor = Object.prototype.hasOwnProperty.call(config, 'defaultCaretColor')
    ? config.defaultCaretColor
    : (input.style.caretColor || 'var(--x-ext-input-caret, #7DB7FF)');
  const prefixId = config.prefixId || (surface === 'overlay'
    ? '_x_extension_site_search_prefix_2024_unique_'
    : '_x_extension_newtab_site_search_prefix_2024_unique_');
  const tabHintId = config.tabHintId || (surface === 'overlay'
    ? '_x_extension_site_search_tab_hint_2026_unique_'
    : '_x_extension_newtab_site_search_tab_hint_2026_unique_');
  const vars = surface === 'overlay'
    ? {
      tagBg: 'var(--x-ov-tag-bg, #F3F4F6)',
      tagText: 'var(--x-ov-tag-text, #6B7280)',
      panelBorder: 'var(--x-ov-border, rgba(0, 0, 0, 0.08))',
      panelBg: 'var(--x-ov-mode-menu-bg, #FFFFFF)',
      panelText: 'var(--x-ov-text, #111827)',
      panelShadow: 'var(--x-ov-shadow, 0 16px 40px rgba(15, 23, 42, 0.13))',
      panelRadius: 'var(--x-ov-panel-radius, 26px)',
      panelGap: '14px'
    }
    : {
      tagBg: 'var(--x-nt-tag-bg, #F3F4F6)',
      tagText: 'var(--x-nt-tag-text, #6B7280)',
      panelBorder: 'var(--x-nt-surface-border, var(--x-nt-panel-border, rgba(0, 0, 0, 0.08)))',
      panelBg: 'var(--x-nt-mode-menu-bg, #FFFFFF)',
      panelText: 'var(--x-nt-text, #111827)',
      panelShadow: 'var(--x-nt-panel-shadow-focus, 0 16px 40px rgba(15, 23, 42, 0.13))',
      panelRadius: 'var(--x-nt-search-shell-radius, 26px)',
      panelGap: '18px'
    };
  inputModeState.inputModePrefixAnimation = null;
  inputModeState.inputModePrefixAnimationFrame = null;
  inputModeState.inputModePrefixAnimationTimer = 0;
  inputModeState.inputModePrefixContentRevision = 0;
  inputModeState.inputModePrefixCurrentAnimation = null;
  inputModeState.inputModePrefixPendingText = '';
  let layoutResizeObserver = null;
  inputModeState.modeMenuOpen = false;
  inputModeState.modeMenuPending = false;
  inputModeState.modeMenuRequestId = 0;
  inputModeState.modeMenuFilterQuery = '';
  inputModeState.renderedModeMenuEntries = [];
  const canReorderModeMenu = typeof config.onModeMenuReorder === 'function';
  const canMoveModeMenuGroups = typeof config.onModeMenuGroupMove === 'function';
  let detachModeMenuReorder = () => {};
  inputModeState.modeTagActive = false;
  inputModeState.destroyed = false;

  function getModeMenuPlaceholder() {
    return formatMessage(
      'search_scope_panel_placeholder',
      'Search specific site content…'
    );
  }

  function getModeActivePlaceholder() {
    return formatMessage(
      'search_scope_active_placeholder',
      'Search within this scope; press Tab again to open the scope panel…'
    );
  }

  function hasVisibleModePrefix() {
    return siteSearchPrefix.style.getPropertyValue('display') !== 'none';
  }

  function syncInputPlaceholder() {
    if (inputModeState.modeMenuOpen && !modeMenu.hidden) {
      input.placeholder = getModeMenuPlaceholder();
      return;
    }
    input.placeholder = hasVisibleModePrefix()
      ? getModeActivePlaceholder()
      : getDefaultPlaceholder();
  }

  function getModeMenuPinyinApi() {
    return globalThis.pinyinPro || (
      typeof globalThis !== 'undefined' ? globalThis.pinyinPro : null
    );
  }
  function ensureModeMenuPinyinRuntime() {
    const existingApi = getModeMenuPinyinApi();
    if (existingApi && typeof existingApi.pinyin === 'function') {
      return null;
    }
    if (typeof config.loadPinyinRuntime === 'function') {
      return Promise.resolve(config.loadPinyinRuntime()).catch(() => null);
    }
    const chromeApi = globalThis.chrome || (
      typeof globalThis !== 'undefined' ? globalThis.chrome : null
    );
    if (!chromeApi || !chromeApi.runtime ||
        typeof chromeApi.runtime.getURL !== 'function') {
      return null;
    }
    try {
      return import(chromeApi.runtime.getURL('assets/vendor/pinyin-pro.js'))
        .then(() => getModeMenuPinyinApi())
        .catch(() => null);
    } catch (error) {
      return null;
    }
  }
  // The traditional-to-simplified table the shared matcher folds with, so
  // 臺灣 finds a card named 台湾 and the other way round.
  function ensureModeMenuHanVariants() {
    const loaded = globalThis.LumnoSearchHanVariants || (
      typeof globalThis !== 'undefined' ? globalThis.LumnoSearchHanVariants : null
    );
    const chromeApi = globalThis.chrome || (
      typeof globalThis !== 'undefined' ? globalThis.chrome : null
    );
    if (loaded || !chromeApi || !chromeApi.runtime ||
        typeof chromeApi.runtime.getURL !== 'function') {
      return null;
    }
    try {
      return import(chromeApi.runtime.getURL('src/shared/search/search-han-variants.js'))
        .then(() => true)
        .catch(() => null);
    } catch (error) {
      return null;
    }
  }
  // Only the scope panel's filter reads pinyin, so the runtime loads on the first typed
  // character or the first panel open, not while the page is opening.
  inputModeState.modeMenuPinyinRuntimeReady = undefined;
  let modeMenuPinyinRuntimeRequested = false;
  function requestModeMenuPinyinRuntime() {
    if (!modeMenuPinyinRuntimeRequested) {
      modeMenuPinyinRuntimeRequested = true;
      inputModeState.modeMenuPinyinRuntimeReady = ensureModeMenuPinyinRuntime();
      // Cards indexed from the fallback table pick up every reading, and
      // the simplified forms, once the runtime and the table arrive.
      Promise.all([inputModeState.modeMenuPinyinRuntimeReady, ensureModeMenuHanVariants()])
        .then(([api, variantsLoaded]) => {
          if ((api && typeof api.pinyin === 'function') || variantsLoaded) {
            refreshModeMenuSearchIndexes();
          }
        });
    }
    return inputModeState.modeMenuPinyinRuntimeReady;
  }
  const providedModeMenuCursorTooltipController =
    config.modeMenuCursorTooltipController || config.modeMenuTooltipController || null;
  const modeMenuCursorTooltipController = providedModeMenuCursorTooltipController || (
    typeof cursorTooltipApi.createController === 'function'
      ? cursorTooltipApi.createController({
        documentObj: doc,
        windowObj: win,
        appendTo: doc && doc.body,
        id: `${prefixId}-label-cursor-tooltip`,
        maxWidth: 320,
        offsetX: 14,
        offsetY: 16
      })
      : null
  );
  const ownsModeMenuCursorTooltipController = Boolean(
    modeMenuCursorTooltipController && !providedModeMenuCursorTooltipController
  );

  const createSvgElement = (tagName) => typeof doc.createElementNS === 'function'
    ? doc.createElementNS('http://www.w3.org/2000/svg', tagName)
    : doc.createElement(tagName);
  const siteSearchPrefix = applyNoTranslate(parts.modePrefix);
  const siteSearchPrefixGlyph = parts.modePrefixGlyph || doc.createElement('i');
  const siteSearchPrefixLineIcon = createSvgElement('svg');
  const siteSearchPrefixIcon = parts.modePrefixIcon;
  const siteSearchPrefixIconFrame = parts.modePrefixIconFrame || doc.createElement('span');
  const siteSearchPrefixText = applyNoTranslate(parts.modePrefixText);
  const siteSearchPrefixCurrent = applyNoTranslate(
    parts.modePrefixCurrent || doc.createElement('span')
  );
  const siteSearchPrefixCurrentText = applyNoTranslate(
    typeof siteSearchPrefixCurrent.querySelector === 'function'
      ? siteSearchPrefixCurrent.querySelector('[data-search-input-mode-current-text]') ||
        doc.createElement('span')
      : doc.createElement('span')
  );
  const siteSearchPrefixChevron = parts.modePrefixChevron || doc.createElement('i');
  const modeMenuWasProvided = Boolean(parts.modeMenu);
  const modeMenu = applyNoTranslate(parts.modeMenu || doc.createElement('div'));

  const {
    setModeMenuResultOffset,
    fitModeMenuWithinViewport,
    notifyModeMenuLayoutChange,
    cancelModeMenuRevealFrame,
    isModeMenuVisible,
    revealModeMenuSurface,
    concealModeMenuSurface
  } = INPUT_MODE_MODE_MENU_LAYOUT.createModeMenuLayout({
    setStyle,
    modeMenu,
    useImportantStyles,
    container,
    win,
    doc,
    DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET,
    config,
    menuSurface,
    inputModeState
  });



  const {
    renderModeMenu,
    handleModeMenuHistoryKeydown,
    attachModeMenuReorder,
    refreshModeMenuSearchIndexes,
    applyModeMenuFilter,
    syncModeMenuQueryLift
  } = INPUT_MODE_MODE_MENU_RENDER.createModeMenuRender({
    clearModeMenuContents: (...args) => clearModeMenuContents(...args),
    doc,
    canMoveModeMenuGroups,
    canReorderModeMenu,
    createModeMenuIcon: (...args) => createModeMenuIcon(...args),
    createModeMenuLabel: (...args) => createModeMenuLabel(...args),
    bindModeMenuLabelTooltip: (...args) => bindModeMenuLabelTooltip(...args),
    selectModeMenuItem: (...args) => selectModeMenuItem(...args),
    buildModeMenuSearchIndex: (...args) => buildModeMenuSearchIndex(...args),
    applyNoTranslate,
    formatMessage,
    modeMenu,
    config,
    normalizeModeMenuSearchText: (...args) => normalizeModeMenuSearchText(...args),
    refreshModeMenuFilterText: (...args) => refreshModeMenuFilterText(...args),
    getModeMenuItemMatch: (...args) => getModeMenuItemMatch(...args),
    renderModeMenuLabelMatch: (...args) => renderModeMenuLabelMatch(...args),
    updateModeMenuFooterAlignment: (...args) => updateModeMenuFooterAlignment(...args),
    notifyModeMenuLayoutChange,
    input,
    setStyle,
    useImportantStyles,
    inputModeState
  });

  const {
    openModeMenu,
    refreshModeMenu,
    closeModeMenu,
    handlePrefixClick,
    handlePrefixKeydown,
    handleMenuKeydown,
    handleModeMenuKeyEvent,
    handleModeMenuPointerDown,
    handleDocumentPointerDown
  } = INPUT_MODE_MODE_MENU_LIFECYCLE.createModeMenuLifecycle({
    config,
    refreshModeMenuLanguage: (...args) => refreshModeMenuLanguage(...args),
    resetModeMenuDoubleTab: (...args) => resetModeMenuDoubleTab(...args),
    resetModeTagRemovalConfirmation: (...args) => resetModeTagRemovalConfirmation(...args),
    renderModeMenu,
    syncModeMenuQueryLift,
    modeMenu,
    syncInputPlaceholder,
    updateModeMenuFooterAlignment: (...args) => updateModeMenuFooterAlignment(...args),
    revealModeMenuSurface,
    container,
    siteSearchPrefix,
    setStyle,
    useImportantStyles,
    setInputModePrefixMenuOpen: (...args) => setInputModePrefixMenuOpen(...args),
    notifyModeMenuLayoutChange,
    focusModeInput: (...args) => focusModeInput(...args),
    focusModeMenuSearch: (...args) => focusModeMenuSearch(...args),
    focusModeMenuButton: (...args) => focusModeMenuButton(...args),
    requestModeMenuPinyinRuntime,
    doc,
    getModeMenuButtons: (...args) => getModeMenuButtons(...args),
    cancelModeMenuRevealFrame,
    modeMenuCursorTooltipController,
    setModeMenuSearchActive: (...args) => setModeMenuSearchActive(...args),
    concealModeMenuSurface,
    getModeMenuActiveElement: (...args) => getModeMenuActiveElement(...args),
    applyModeMenuFilter,
    focusFirstModeMenuFilterResult: (...args) => focusFirstModeMenuFilterResult(...args),
    getModeMenuDirectionalIndex: (...args) => getModeMenuDirectionalIndex(...args),
    selectModeMenuItem: (...args) => selectModeMenuItem(...args),
    handleModeMenuTabFocusToggle: (...args) => handleModeMenuTabFocusToggle(...args),
    shouldHandleModeMenuKeyEvent: (...args) => shouldHandleModeMenuKeyEvent(...args),
    inputModeState
  });

  const {
    getModeMenuButtons,
    getModeMenuActiveElement,
    setModeMenuSearchActive,
    focusModeMenuSearch,
    focusModeInput,
    shouldHandleModeMenuKeyEvent,
    focusModeMenuButton,
    focusFirstModeMenuFilterResult,
    getModeMenuDirectionalIndex,
    selectModeMenuItem
  } = INPUT_MODE_MODE_MENU_NAVIGATION.createModeMenuNavigation({
    modeMenu,
    doc,
    input,
    DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT,
    DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT,
    win,
    normalizeModeMenuSearchText: (...args) => normalizeModeMenuSearchText(...args),
    config,
    refreshModeMenu,
    inputModeState
  });

  const {
    resetModeTagRemovalConfirmation,
    resetModeMenuDoubleTab,
    shouldOpenModeMenuOnDoubleTab,
    shouldCompleteModeMenuDoubleTab,
    handleModeMenuTabFocusToggle,
    shouldOpenModeMenuForActiveModeOnTab,
    shouldRemoveModeTagOnBackspace
  } = INPUT_MODE_MODE_TAB_KEYS.createModeTabKeys({
    win,
    config,
    input,
    siteSearchPrefix,
    DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION,
    getModeMenuActiveElement,
    modeMenu,
    focusModeInput,
    focusModeMenuSearch,
    DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION,
    inputModeState
  });

  const siteSearchTabHint = applyNoTranslate(parts.modeTabHint);

  const {
    shouldReduceInputModeMotion,
    getBuiltInSurfaceColor,
    applyInputModePrefixVisual,
    updateInputRightPadding,
    getModeBadgeElement,
    updatePrefixLayout,
    updateModeMenuFooterAlignment,
    updateLayout
  } = INPUT_MODE_PREFIX_VISUAL.createPrefixVisual({
    win,
    surface,
    getModeMenuLineIconPaths,
    isDarkMode,
    getThemeForMode,
    defaultTheme,
    parseCssColor,
    defaultAccentColor,
    mixRgb,
    getAccessibleThemeTextRgb,
    rgbToCss,
    setStyle,
    container,
    useImportantStyles,
    siteSearchPrefix,
    siteSearchPrefixLineIcon,
    siteSearchPrefixChevron,
    siteSearchPrefixCurrent,
    input,
    getExtraRightInset,
    rightAnchorOffset,
    rightReserveBase,
    siteSearchTabHint,
    isElementVisible,
    setInputStyle,
    config,
    configuredBaseInputPaddingLeft,
    prefixGap,
    modeMenu,
    notifyModeMenuLayoutChange,
    inputModeState
  });


  const {
    clearModeMenuContents,
    renderModeLineIconSvg,
    createModeMenuIcon
  } = INPUT_MODE_MODE_MENU_ICONS.createModeMenuIcons({
    modeMenuCursorTooltipController,
    getThemeForMode,
    defaultTheme,
    parseCssColor,
    defaultAccentColor,
    mixRgb,
    isDarkMode,
    getAccessibleThemeFocusRingRgb,
    setStyle,
    rgbToCss,
    useImportantStyles,
    getBuiltInSurfaceColor,
    getModeMenuLineIconPaths,
    createSvgElement,
    doc,
    getThemeForProvider,
    resolveProviderIconUrl,
    removeProviderIconRuntimeFallbacks: (...args) => removeProviderIconRuntimeFallbacks(...args),
    getProviderThemeHost,
    attachProviderIcon,
    preferDirectProviderIcons,
    attachFaviconData,
    inputModeState
  });

  const {
    setInputModePrefixIdentity,
    cancelInputModePrefixIconAnimation,
    measureInputModePrefixWidthForText,
    setInputModePrefixContent,
    getInputModePrefixRenderedWidth,
    getInputModePrefixCurrentVisualState
  } = INPUT_MODE_PREFIX_CONTENT.createPrefixContent({
    siteSearchPrefix,
    formatMessage,
    setStyle,
    useImportantStyles,
    shouldReduceInputModeMotion,
    siteSearchPrefixLineIcon,
    siteSearchPrefixIconFrame,
    siteSearchPrefixGlyph,
    isElementVisible,
    DEFAULT_PREFIX_ICON_POP_DURATION,
    DEFAULT_PREFIX_ICON_POP_EASING,
    DEFAULT_PREFIX_ICON_EXIT_DURATION,
    DEFAULT_PREFIX_ICON_EXIT_EASING,
    siteSearchPrefixText,
    resolveProviderIconUrl,
    renderModeLineIconSvg,
    siteSearchPrefixIcon,
    cssText,
    removeProviderIconRuntimeFallbacks: (...args) => removeProviderIconRuntimeFallbacks(...args),
    updatePrefixLayout,
    attachProviderIcon,
    preferDirectProviderIcons,
    attachFaviconData,
    siteSearchPrefixCurrentText,
    siteSearchPrefixCurrent,
    siteSearchPrefixChevron,
    win,
    inputModeState
  });

  const {
    cancelInputModePrefixAnimation,
    setInputModePrefixRestState,
    playInputModePrefixEnterAnimation,
    playInputModePrefixResizeAnimation,
    settleInputModePrefixMenuVisualState,
    setInputModePrefixMenuOpen
  } = INPUT_MODE_PREFIX_MOTION.createPrefixMotion({
    siteSearchPrefixCurrent,
    setStyle,
    useImportantStyles,
    shouldReduceInputModeMotion,
    updatePrefixLayout,
    DEFAULT_PREFIX_RESIZE_DURATION,
    DEFAULT_PREFIX_RESIZE_EASING,
    win,
    siteSearchPrefix,
    prefixTransition,
    DEFAULT_PREFIX_ENTER_DURATION,
    DEFAULT_PREFIX_ENTER_EASING,
    modeMenu,
    isElementVisible,
    getInputModePrefixCurrentVisualState,
    DEFAULT_PREFIX_ITEM_GAP_PX,
    inputModeState
  });

  const siteSearchTabHintKey = applyNoTranslate(parts.modeTabHintKey);
  const siteSearchTabHintText = applyNoTranslate(parts.modeTabHintText);

  const {
    setPrefixText,
    setProviderPrefix,
    clearProviderPrefix,
    removeProviderIconRuntimeFallbacks,
    setTabHintVisible
  } = INPUT_MODE_PREFIX_TEXT.createPrefixText({
    config,
    siteSearchPrefix,
    siteSearchPrefixText,
    resetModeMenuDoubleTab,
    resetModeTagRemovalConfirmation,
    isElementVisible,
    getInputModePrefixRenderedWidth,
    cancelInputModePrefixAnimation,
    settleInputModePrefixMenuVisualState,
    setStyle,
    prefixTransition,
    useImportantStyles,
    setInputModePrefixIdentity,
    applyInputModePrefixVisual,
    syncInputPlaceholder,
    setInputStyle,
    input,
    updatePrefixLayout,
    measureInputModePrefixWidthForText,
    playInputModePrefixResizeAnimation,
    setInputModePrefixContent,
    setInputModePrefixRestState,
    playInputModePrefixEnterAnimation,
    isAiSiteSearchProvider,
    getProviderIcon,
    getProviderThemeHost,
    getSiteSearchPrefixText,
    cancelInputModePrefixIconAnimation,
    siteSearchPrefixIcon,
    siteSearchPrefixIconFrame,
    siteSearchPrefixGlyph,
    siteSearchPrefixLineIcon,
    siteSearchPrefixChevron,
    closeModeMenu,
    getDefaultPlaceholder,
    defaultCaretColor,
    getSiteSearchDisplayName,
    formatMessage,
    siteSearchTabHintKey,
    cssText,
    vars,
    siteSearchTabHintText,
    siteSearchTabHint,
    win,
    updateInputRightPadding,
    inputModeState
  });

  INPUT_MODE_CONTROLLER_DOM.createControllerDom({
    siteSearchPrefix,
    siteSearchPrefixIcon,
    siteSearchPrefixText,
    siteSearchTabHint,
    siteSearchTabHintKey,
    siteSearchTabHintText,
    prefixId,
    siteSearchPrefixIconFrame,
    siteSearchPrefixGlyph,
    siteSearchPrefixLineIcon,
    cssText,
    useImportantStyles,
    siteSearchPrefixChevron,
    siteSearchPrefixCurrent,
    siteSearchPrefixCurrentText,
    DEFAULT_PREFIX_ITEM_GAP_PX,
    INPUT_FONT_STACK,
    prefixTransition,
    setStyle,
    modeMenu,
    menuSurfaceClass,
    menuSurface,
    surface,
    vars,
    container,
    applyNoTranslate,
    doc,
    inputModeState
  });

  const {
    refreshModeMenuFilterText,
    refreshModeMenuLanguage
  } = INPUT_MODE_MODE_MENU_LANGUAGE.createModeMenuLanguage({
    formatMessage,
    doc,
    shortcutDisplayApi,
    config,
    win,
    syncInputPlaceholder,
    siteSearchTabHint,
    tabHintId,
    siteSearchTabHintKey,
    siteSearchTabHintText,
    cssText,
    rightAnchorOffset,
    vars,
    INPUT_FONT_STACK,
    useImportantStyles,
    inputModeState
  });

  const {
    normalizeModeMenuSearchText,
    buildModeMenuSearchIndex,
    getModeMenuItemMatch,
    renderModeMenuLabelMatch,
    createModeMenuLabel,
    bindModeMenuLabelTooltip
  } = INPUT_MODE_MODE_MENU_SEARCH.createModeMenuSearch({
    getModeMenuPinyinApi,
    MODE_MENU_PINYIN_FALLBACKS,
    doc,
    modeMenuCursorTooltipController,
    cursorTooltipApi,
    modeMenu
  });

  function handleModeInput(event) {
    requestModeMenuPinyinRuntime();
    resetModeMenuDoubleTab();
    resetModeTagRemovalConfirmation();
    syncModeMenuQueryLift(event);
  }

  function handleModeInputKeydown(event) {
    if (event && event.key !== 'Tab') {
      resetModeMenuDoubleTab();
    }
    if (event && event.key !== 'Backspace' &&
        !event.metaKey && !event.ctrlKey && !event.altKey) {
      resetModeTagRemovalConfirmation();
    }
  }

  function handleModeInputBlur() {
    resetModeMenuDoubleTab();
  }

  function handleModeInputFocus() {
    setModeMenuSearchActive(false);
  }

  const modePointerEventRoot = typeof container.getRootNode === 'function'
    ? container.getRootNode()
    : null;

  siteSearchPrefix.addEventListener('click', handlePrefixClick);
  siteSearchPrefix.addEventListener('keydown', handlePrefixKeydown);
  input.addEventListener('input', handleModeInput);
  input.addEventListener('keydown', handleModeInputKeydown);
  input.addEventListener('blur', handleModeInputBlur);
  input.addEventListener('focus', handleModeInputFocus);
  modeMenu.addEventListener('keydown', handleMenuKeydown);
  modeMenu.addEventListener('pointerdown', handleModeMenuPointerDown);
  detachModeMenuReorder = attachModeMenuReorder();
  if (typeof config.onModeMenuHistory === 'function' && typeof container.addEventListener === 'function') {
    container.addEventListener('keydown', handleModeMenuHistoryKeydown, true);
  }
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('pointerdown', handleDocumentPointerDown, true);
  }
  if (modePointerEventRoot && modePointerEventRoot !== doc &&
      typeof modePointerEventRoot.addEventListener === 'function') {
    modePointerEventRoot.addEventListener(
      'pointerdown',
      handleDocumentPointerDown,
      true
    );
  }

  function onResize() {
    updateLayout();
  }

  if (win && typeof win.ResizeObserver === 'function') {
    layoutResizeObserver = new win.ResizeObserver(updateLayout);
    layoutResizeObserver.observe(siteSearchPrefix);
    layoutResizeObserver.observe(siteSearchTabHint);
    layoutResizeObserver.observe(inputModeState.modeMenuContent);
    const badgeElement = getModeBadgeElement();
    if (badgeElement) {
      layoutResizeObserver.observe(badgeElement);
    }
  }

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('resize', onResize);
  }

  function destroy() {
    inputModeState.destroyed = true;
    detachModeMenuReorder();
    if (typeof container.removeEventListener === 'function') {
      container.removeEventListener('keydown', handleModeMenuHistoryKeydown, true);
    }
    inputModeState.modeMenuRequestId += 1;
    inputModeState.modeMenuPending = false;
    cancelModeMenuRevealFrame();
    resetModeMenuDoubleTab();
    resetModeTagRemovalConfirmation();
    cancelInputModePrefixAnimation();
    cancelInputModePrefixIconAnimation();
    if (win && typeof win.removeEventListener === 'function') {
      win.removeEventListener('resize', onResize);
    }
    if (layoutResizeObserver) {
      layoutResizeObserver.disconnect();
      layoutResizeObserver = null;
    }
    if (typeof siteSearchPrefix.removeEventListener === 'function') {
      siteSearchPrefix.removeEventListener('click', handlePrefixClick);
      siteSearchPrefix.removeEventListener('keydown', handlePrefixKeydown);
    }
    if (typeof modeMenu.removeEventListener === 'function') {
      modeMenu.removeEventListener('keydown', handleMenuKeydown);
      modeMenu.removeEventListener('pointerdown', handleModeMenuPointerDown);
    }
    if (typeof input.removeEventListener === 'function') {
      input.removeEventListener('input', handleModeInput);
      input.removeEventListener('keydown', handleModeInputKeydown);
      input.removeEventListener('blur', handleModeInputBlur);
      input.removeEventListener('focus', handleModeInputFocus);
    }
    if (doc && typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    }
    if (modePointerEventRoot && modePointerEventRoot !== doc &&
        typeof modePointerEventRoot.removeEventListener === 'function') {
      modePointerEventRoot.removeEventListener(
        'pointerdown',
        handleDocumentPointerDown,
        true
      );
    }
    clearProviderPrefix();
    setTabHintVisible(false);
    if (ownsModeMenuCursorTooltipController &&
        typeof modeMenuCursorTooltipController.destroy === 'function') {
      modeMenuCursorTooltipController.destroy();
    } else if (modeMenuCursorTooltipController &&
        typeof modeMenuCursorTooltipController.hide === 'function') {
      modeMenuCursorTooltipController.hide();
    }
    if (!modeMenuWasProvided) {
      modeMenu.remove();
    }
  }

  return Object.freeze({
    prefixElement: siteSearchPrefix,
    tabHintElement: siteSearchTabHint,
    setProviderPrefix,
    setPrefixText,
    clearProviderPrefix,
    closeModeMenu,
    fitModeMenuWithinViewport,
    isModeMenuVisible,
    menuElement: modeMenu,
    getModeMenuFilterQuery: () => inputModeState.modeMenuFilterQuery,
    hasActiveModeTag: () => inputModeState.modeTagActive,
    openModeMenu,
    refreshModeMenuLanguage,
    refreshModeMenu,
    resetModeMenuDoubleTab,
    resetModeTagRemovalConfirmation,
    setModeMenuResultOffset,
    setTabHintVisible,
    shouldCompleteModeMenuDoubleTab,
    handleModeMenuTabFocusToggle,
    handleModeMenuKeyEvent,
    shouldHandleModeMenuKeyEvent,
    shouldOpenModeMenuForActiveModeOnTab,
    shouldOpenModeMenuOnDoubleTab,
    shouldRemoveModeTagOnBackspace,
    updateLayout,
    destroy
  });
}

export { createInputModeController };
