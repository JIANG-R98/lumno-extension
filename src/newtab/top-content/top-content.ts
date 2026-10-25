// The wordmark/clock area above the search box. Moving the blocks around
// it when it shows, hides or changes height is layout-motion.ts's job.
import type * as LumnoSettings from '../../domain/settings';
import type { NewtabTimeInk, NewtabTopContentMode } from '../../domain/settings';
import type * as LumnoCommunityLinks from '../../platform/community-links';
import * as LumnoSettingsStorage from '../../platform/settings-storage';
import { queryHtmlElement } from '../../shared/dom-lookup';
import type { TopContentController } from '../react/wordmark';

// A card's place on screen before a layout change.
type LayoutPosition = { left: number; top: number };

interface TopContentState {
  newtabTopContentMode: NewtabTopContentMode;
  newtabTimeFont: string;
  newtabTimeFontSize: number;
  newtabTimeFontWeight: number;
  newtabTimeInk: NewtabTimeInk;
  newtabTimeOpacity: number;
  newtabTimeSecondsVisible: boolean;
  newtabTime12Hour: boolean;
  zenModeEnabled: boolean;
  topContentContainer: HTMLElement | null;
  topContentController: TopContentController | null;
  wordmarkImageEl: HTMLImageElement | null;
  // Refreshes the clock controls of the appearance panel.
  wallpaperRuntime: {
    updateTimeSecondsVisibleUi?(): void;
    updateTimeFontWeightUi?(): void;
  } | null;
}

interface TopContentDeps {
  COMMUNITY_LINKS: Pick<typeof LumnoCommunityLinks, 'getStoreListing'>;
  recentCards: readonly HTMLElement[];
  SETTINGS: Pick<typeof LumnoSettings,
    'NEWTAB_TIME_FONT_SIZE_DEFAULT' | 'normalizeNewtabTimeFontSize' | 'getNewtabTimeFont' |
    'getNewtabTimeFontTracking' | 'resolveNewtabTimeFontWeight' | 'normalizeNewtabTimeOpacity' |
    'normalizeNewtabTimeInk' | 'normalizeNewtabTime12Hour'>;
  updateSearchEntryLayout(): void;
  updateSuggestionsFloatingLayout(): void;
  scheduleWallpaperAdaptiveToneUpdate(): void;
  normalizeNewtabTopContentMode(value: unknown): NewtabTopContentMode;
  normalizeNewtabTimeFontWeight(value: unknown): number;
  normalizeNewtabTimeFont(value: unknown): string;
  normalizeNewtabTimeSecondsVisible(value: unknown): boolean;
  // The ink a fixed clock color draws in, or '' when it follows the page.
  getFixedTimeInk(): Exclude<NewtabTimeInk, 'auto'> | '';
  pageState: TopContentState;
}

function createTopContentRuntime(deps: TopContentDeps) {
  const {
    COMMUNITY_LINKS,
    recentCards,
    SETTINGS,
    updateSearchEntryLayout,
    updateSuggestionsFloatingLayout,
    scheduleWallpaperAdaptiveToneUpdate,
    normalizeNewtabTopContentMode,
    normalizeNewtabTimeFontWeight,
    normalizeNewtabTimeFont,
    normalizeNewtabTimeSecondsVisible,
    getFixedTimeInk
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  let wordmarkSolidEl: HTMLSpanElement | null = null;
  const recentResizeLayoutAnimations = new Set<Animation>();
  let wordmarkEntryTransitionTimer = 0;
  const WORDMARK_ENTRY_ANIMATION_TOTAL_MS = 260;
  const WORDMARK_WALLPAPER_COVER_DARK_OPACITY = '0.32';
  const WORDMARK_WALLPAPER_COVER_LIGHT_OPACITY = '0.32';
  const WORDMARK_WALLPAPER_SOLID_OPACITY = '0.6';
  const RECENT_RESIZE_LAYOUT_TRANSITION_MS = 260;
  const RECENT_RESIZE_LAYOUT_TRANSITION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  // The area fits the wordmark and the default 54px clock; a larger clock
  // gets the same headroom for its size.
  const TOP_CONTENT_MAX_HEIGHT_PX = 74;
  const TOP_CONTENT_DEFAULT_TIME_FONT_SIZE = Number(SETTINGS.NEWTAB_TIME_FONT_SIZE_DEFAULT) || 54;

  function getTopContentMaxHeight(): number {
    if (pageState.newtabTopContentMode !== 'time') {
      return TOP_CONTENT_MAX_HEIGHT_PX;
    }
    const fontSize = SETTINGS.normalizeNewtabTimeFontSize(pageState.newtabTimeFontSize);
    return Math.max(
      TOP_CONTENT_MAX_HEIGHT_PX,
      Math.ceil((fontSize * TOP_CONTENT_MAX_HEIGHT_PX) / TOP_CONTENT_DEFAULT_TIME_FONT_SIZE)
    );
  }

  function captureRecentCardLayout(): Map<HTMLElement, LayoutPosition> {
    const positions = new Map<HTMLElement, LayoutPosition>();
    recentCards.forEach((card) => {
      if (!card || !card.isConnected || typeof card.getBoundingClientRect !== 'function') {
        return;
      }
      const rect = card.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top) ||
          (rect.width <= 0 && rect.height <= 0)) {
        return;
      }
      positions.set(card, { left: rect.left, top: rect.top });
    });
    return positions;
  }

  function cancelRecentResizeLayoutAnimations(): void {
    recentResizeLayoutAnimations.forEach((animation) => animation.cancel());
    recentResizeLayoutAnimations.clear();
  }

  function prefersSystemReducedMotion(): boolean {
    return Boolean(
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function shouldSkipNewtabEntryMotion(): boolean {
    // The search shortcut's focus reload replaces a page already on screen.
    if (document.documentElement &&
        document.documentElement.getAttribute('data-nt-focus-resume') === 'true') {
      return true;
    }
    const motionEffectsEnabled = !document.documentElement ||
      document.documentElement.getAttribute('data-lumno-motion-effects') !== 'off';
    return LumnoSettingsStorage.shouldSkipEntryMotion(window, motionEffectsEnabled);
  }

  function shouldAnimateNewtabLayoutShift(): boolean {
    const body = document.body;
    return Boolean(
      body &&
      body.getAttribute('data-nt-ready') === '1' &&
      body.getAttribute('data-nt-enter') !== 'run' &&
      body.getAttribute('data-nt-suggestions-open') !== 'true' &&
      !prefersSystemReducedMotion()
    );
  }

  function animateLayoutShift(
    fromPositions: ReadonlyMap<Element, LayoutPosition> | null | undefined,
    animations: Set<Animation>
  ): void {
    if (!fromPositions || fromPositions.size === 0) {
      return;
    }
    fromPositions.forEach((fromPosition, element) => {
      if (!element || !element.isConnected || typeof element.animate !== 'function') {
        return;
      }
      const rect = element.getBoundingClientRect();
      const deltaX = fromPosition.left - rect.left;
      const deltaY = fromPosition.top - rect.top;
      if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) ||
          (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5)) {
        return;
      }
      const animation = element.animate(
        [
          { translate: `${deltaX}px ${deltaY}px` },
          { translate: '0 0' }
        ],
        {
          duration: RECENT_RESIZE_LAYOUT_TRANSITION_MS,
          easing: RECENT_RESIZE_LAYOUT_TRANSITION_EASING,
          fill: 'both'
        }
      );
      animations.add(animation);
      animation.oncancel = () => {
        animations.delete(animation);
      };
      animation.onfinish = () => {
        animations.delete(animation);
        animation.cancel();
      };
    });
  }

  function animateRecentResizeLayout(fromPositions: ReadonlyMap<Element, LayoutPosition> | null | undefined): void {
    animateLayoutShift(fromPositions, recentResizeLayoutAnimations);
  }

  function applyNewtabTopContentVisibility(options?: { contentChanged?: boolean } | null): void {
    const container = pageState.topContentContainer;
    if (!container) {
      return;
    }
    const transitionOptions = options || {};
    const body = document.body;
    const nextVisible = Boolean(pageState.newtabTopContentMode !== 'off' && !pageState.zenModeEnabled);
    const wasVisible = container.getAttribute('data-visible') !== 'false';
    const stateChanged = wasVisible !== nextVisible;
    const layoutChanged = stateChanged || Boolean(transitionOptions.contentChanged);
    const suggestionsOpen = Boolean(
      body && body.getAttribute('data-nt-suggestions-open') === 'true'
    );
    const shouldAnimate = Boolean(
      body &&
      body.getAttribute('data-nt-ready') === '1' &&
      layoutChanged &&
      !suggestionsOpen &&
      !prefersSystemReducedMotion()
    );
    container.setAttribute('data-visible', nextVisible ? 'true' : 'false');
    container.style.setProperty('display', 'flex');
    container.style.setProperty('transition', 'none');
    if (nextVisible) {
      container.style.removeProperty('height');
    } else {
      container.style.setProperty('height', '0px');
    }
    container.style.setProperty('max-height', nextVisible ? `${getTopContentMaxHeight()}px` : '0');
    container.style.setProperty('margin-bottom', nextVisible ? '28px' : '0');
    container.style.setProperty('opacity', nextVisible ? '1' : '0');
    container.style.removeProperty('transform');
    container.style.setProperty('pointer-events', nextVisible ? 'auto' : 'none');
    container.inert = !nextVisible;
    if (nextVisible) {
      container.removeAttribute('aria-hidden');
    } else {
      container.setAttribute('aria-hidden', 'true');
    }
    if (stateChanged && !nextVisible) {
      finishWordmarkEntryAnimation();
    } else if (stateChanged && shouldAnimate && nextVisible) {
      restartWordmarkEntryAnimation();
    }
    updateSearchEntryLayout();
    updateSuggestionsFloatingLayout();
    scheduleWallpaperAdaptiveToneUpdate();
  }

  function finishWordmarkEntryAnimation(): void {
    if (wordmarkEntryTransitionTimer) {
      window.clearTimeout(wordmarkEntryTransitionTimer);
      wordmarkEntryTransitionTimer = 0;
    }
    if (pageState.topContentContainer) {
      pageState.topContentContainer.setAttribute('data-enter', 'done');
    }
  }

  function restartWordmarkEntryAnimation(): void {
    const container = pageState.topContentContainer;
    if (!container) {
      return;
    }
    if (prefersSystemReducedMotion()) {
      finishWordmarkEntryAnimation();
      return;
    }
    const wordmarkContent = queryHtmlElement(container, '.x-nt-wordmark-content');
    if (wordmarkEntryTransitionTimer) {
      window.clearTimeout(wordmarkEntryTransitionTimer);
      wordmarkEntryTransitionTimer = 0;
    }
    container.setAttribute('data-enter', 'done');
    if (wordmarkContent) {
      void wordmarkContent.offsetWidth;
    }
    container.setAttribute('data-enter', 'run');
    wordmarkEntryTransitionTimer = window.setTimeout(
      finishWordmarkEntryAnimation,
      WORDMARK_ENTRY_ANIMATION_TOTAL_MS
    );
  }

  function getWordmarkSolidFill(wallpaperActive: boolean, wallpaperInk: string | null, theme: string | null): string {
    // A fixed clock ink keeps its tone off the wallpaper too (the adaptive
    // tone already sampled it in that ink on a wallpaper).
    const fixedInk = getFixedTimeInk();
    if (fixedInk && !wallpaperActive) {
      return fixedInk === 'light' ? 'rgb(248 250 252)' : 'rgb(31 41 55)';
    }
    // Until the wallpaper is sampled, the fallback draws the ink already known.
    if (wallpaperActive) {
      return (fixedInk || wallpaperInk) === 'light'
        ? 'var(--x-nt-wallpaper-wordmark-ink, rgb(238 240 242))'
        : 'var(--x-nt-wallpaper-wordmark-ink, rgb(78 84 94))';
    }
    return theme === 'dark' ? 'rgb(248 250 252)' : 'rgb(31 41 55)';
  }

  function applyWordmarkSolidFill(fill: string): void {
    if (!pageState.topContentContainer) {
      return;
    }
    pageState.topContentContainer.style.setProperty('--x-nt-wordmark-solid-fill', fill);
  }

  function applyWordmarkSolidLayerVisible(visible: boolean): void {
    if (!wordmarkSolidEl) {
      return;
    }
    wordmarkSolidEl.style.setProperty(
      'opacity',
      visible ? WORDMARK_WALLPAPER_SOLID_OPACITY : '0'
    );
  }

  function applyWordmarkThemeAppearance(resolvedTheme?: string | null): void {
    const theme = resolvedTheme || (document.body ? document.body.getAttribute('data-theme') : 'light');
    const wallpaperActive = document.body &&
      document.body.getAttribute('data-wallpaper-active') === 'true';
    const wallpaperInk = pageState.topContentContainer
      ? pageState.topContentContainer.getAttribute('data-wallpaper-ink')
      : '';
    applyWordmarkSolidFill(getWordmarkSolidFill(wallpaperActive, wallpaperInk, theme));
    const image = pageState.wordmarkImageEl;
    if (!image) {
      return;
    }
    const lightSrc = '../../assets/images/lumno-wordmark.svg';
    const darkSrc = '../../assets/images/lumno-wordmark-dark.svg';
    if (wallpaperActive) {
      const wallpaperOverlayCover = pageState.topContentContainer &&
        pageState.topContentContainer.getAttribute('data-wallpaper-overlay-cover') === 'true';
      if (wallpaperOverlayCover) {
        applyWordmarkSolidLayerVisible(false);
        const themeSrc = theme === 'dark' ? darkSrc : lightSrc;
        if (image.getAttribute('src') !== themeSrc) {
          image.setAttribute('src', themeSrc);
        }
        applyWordmarkSolidFill(getWordmarkSolidFill(false, '', theme));
        image.style.setProperty(
          'opacity',
          theme === 'dark'
            ? WORDMARK_WALLPAPER_COVER_DARK_OPACITY
            : WORDMARK_WALLPAPER_COVER_LIGHT_OPACITY
        );
        return;
      }
      const wallpaperSrc = wallpaperInk === 'dark' ? lightSrc : darkSrc;
      if (image.getAttribute('src') !== wallpaperSrc) {
        image.setAttribute('src', wallpaperSrc);
      }
      applyWordmarkSolidFill(getWordmarkSolidFill(true, wallpaperInk, theme));
      applyWordmarkSolidLayerVisible(true);
      image.style.setProperty('opacity', '0');
      return;
    }
    applyWordmarkSolidLayerVisible(false);
    if (theme === 'dark') {
      if (image.getAttribute('src') !== darkSrc) {
        image.setAttribute('src', darkSrc);
      }
      applyWordmarkSolidFill(getWordmarkSolidFill(false, '', theme));
      image.style.setProperty('opacity', '0.9');
      return;
    }
    if (image.getAttribute('src') !== lightSrc) {
      image.setAttribute('src', lightSrc);
    }
    applyWordmarkSolidFill(getWordmarkSolidFill(false, '', theme));
    image.style.setProperty('opacity', '0.82');
  }

  function renderNewtabTopContent(animateEntry?: boolean): void {
    const controller = pageState.topContentController;
    if (!controller) {
      return;
    }
    const timeFont = SETTINGS.getNewtabTimeFont(pageState.newtabTimeFont);
    controller.render({
      animateEntry: Boolean(animateEntry),
      ariaLabel: `Lumno ${COMMUNITY_LINKS.getStoreListing().name}`,
      font: {
        id: timeFont.id,
        colonGap: timeFont.colonGap,
        colonShift: timeFont.colonShift,
        family: timeFont.family,
        stretch: timeFont.stretch,
        tracking: SETTINGS.getNewtabTimeFontTracking(timeFont.id, pageState.newtabTimeFontWeight)
      },
      fontSize: SETTINGS.normalizeNewtabTimeFontSize(pageState.newtabTimeFontSize),
      fontWeight: SETTINGS.resolveNewtabTimeFontWeight(timeFont.id, pageState.newtabTimeFontWeight),
      imageSrc: '../../assets/images/lumno-wordmark.svg',
      locale: document.documentElement ? document.documentElement.lang : undefined,
      mode: pageState.newtabTopContentMode === 'time' ? 'time' : 'brand',
      opacity: SETTINGS.normalizeNewtabTimeOpacity(pageState.newtabTimeOpacity) / 100,
      showSeconds: pageState.newtabTimeSecondsVisible,
      twelveHour: pageState.newtabTime12Hour
    });
    pageState.wordmarkImageEl = controller.getImage();
    wordmarkSolidEl = controller.getSolid();
    applyWordmarkThemeAppearance();
    scheduleWallpaperAdaptiveToneUpdate();
  }

  function setNewtabTopContentMode(value: unknown): void {
    const nextMode = normalizeNewtabTopContentMode(value);
    const contentChanged = nextMode !== pageState.newtabTopContentMode;
    if (!contentChanged) {
      return;
    }
    pageState.newtabTopContentMode = nextMode;
    if (nextMode !== 'off') {
      renderNewtabTopContent(false);
    }
    applyNewtabTopContentVisibility({ contentChanged });
  }

  function updateNewtabTimeSecondsVisibleUi(): void {
    if (pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.updateTimeSecondsVisibleUi === 'function') {
      pageState.wallpaperRuntime.updateTimeSecondsVisibleUi();
    }
  }

  function updateNewtabTimePanelUi(): void {
    if (pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.updateTimeFontWeightUi === 'function') {
      pageState.wallpaperRuntime.updateTimeFontWeightUi();
    }
  }

  function setNewtabTimeFontWeight(value: unknown): number {
    const nextValue = normalizeNewtabTimeFontWeight(value);
    const changed = nextValue !== pageState.newtabTimeFontWeight;
    pageState.newtabTimeFontWeight = nextValue;
    if (changed && pageState.newtabTopContentMode === 'time') {
      renderNewtabTopContent(false);
    }
    updateNewtabTimePanelUi();
    return nextValue;
  }

  function setNewtabTimeFontSize(value: unknown): number {
    const nextValue = SETTINGS.normalizeNewtabTimeFontSize(value);
    const changed = nextValue !== pageState.newtabTimeFontSize;
    pageState.newtabTimeFontSize = nextValue;
    if (changed && pageState.newtabTopContentMode === 'time') {
      renderNewtabTopContent(false);
      if (pageState.topContentContainer &&
          pageState.topContentContainer.getAttribute('data-visible') !== 'false') {
        pageState.topContentContainer.style.setProperty('max-height', `${getTopContentMaxHeight()}px`);
        updateSearchEntryLayout();
        updateSuggestionsFloatingLayout();
      }
    }
    updateNewtabTimePanelUi();
    return nextValue;
  }

  function setNewtabTimeInk(value: unknown): NewtabTimeInk {
    const nextValue = SETTINGS.normalizeNewtabTimeInk(value);
    const changed = nextValue !== pageState.newtabTimeInk;
    pageState.newtabTimeInk = nextValue;
    if (changed) {
      applyWordmarkThemeAppearance();
      scheduleWallpaperAdaptiveToneUpdate();
      updateNewtabTimePanelUi();
    }
    return nextValue;
  }

  function setNewtabTimeOpacity(value: unknown): number {
    const nextValue = SETTINGS.normalizeNewtabTimeOpacity(value);
    const changed = nextValue !== pageState.newtabTimeOpacity;
    pageState.newtabTimeOpacity = nextValue;
    if (changed && pageState.newtabTopContentMode === 'time') {
      renderNewtabTopContent(false);
    }
    updateNewtabTimePanelUi();
    return nextValue;
  }

  // Starts loading the face so the clock never draws in a fallback; the
  // promise settles once the face is usable (or failed to load).
  function loadNewtabTimeFont(fontId: unknown): Promise<boolean> {
    const timeFont = SETTINGS.getNewtabTimeFont(fontId);
    if (!document.fonts || typeof document.fonts.load !== 'function') {
      return Promise.resolve(true);
    }
    const weight = SETTINGS.resolveNewtabTimeFontWeight(timeFont.id, pageState.newtabTimeFontWeight);
    return document.fonts.load(`${weight} 54px ${timeFont.family}`, '0123456789:')
      .then(() => true, () => true);
  }

  function setNewtabTimeFont(value: unknown): string {
    const nextValue = normalizeNewtabTimeFont(value);
    const changed = nextValue !== pageState.newtabTimeFont;
    pageState.newtabTimeFont = nextValue;
    if (changed && pageState.newtabTopContentMode === 'time') {
      void loadNewtabTimeFont(nextValue).then(() => {
        if (pageState.newtabTimeFont === nextValue && pageState.newtabTopContentMode === 'time') {
          renderNewtabTopContent(false);
        }
      });
    }
    updateNewtabTimePanelUi();
    return nextValue;
  }

  function setNewtabTime12Hour(value: unknown): boolean {
    const nextValue = SETTINGS.normalizeNewtabTime12Hour(value);
    const changed = nextValue !== pageState.newtabTime12Hour;
    pageState.newtabTime12Hour = nextValue;
    if (changed && pageState.newtabTopContentMode === 'time') {
      renderNewtabTopContent(false);
    }
    updateNewtabTimeSecondsVisibleUi();
    return nextValue;
  }

  function setNewtabTimeSecondsVisible(value: unknown): boolean {
    const nextValue = normalizeNewtabTimeSecondsVisible(value);
    const changed = nextValue !== pageState.newtabTimeSecondsVisible;
    pageState.newtabTimeSecondsVisible = nextValue;
    if (changed && pageState.newtabTopContentMode === 'time') {
      renderNewtabTopContent(false);
    }
    updateNewtabTimeSecondsVisibleUi();
    return nextValue;
  }

  return {
    captureRecentCardLayout,
    cancelRecentResizeLayoutAnimations,
    shouldSkipNewtabEntryMotion,
    shouldAnimateNewtabLayoutShift,
    animateRecentResizeLayout,
    applyNewtabTopContentVisibility,
    finishWordmarkEntryAnimation,
    applyWordmarkThemeAppearance,
    renderNewtabTopContent,
    setNewtabTopContentMode,
    setNewtabTimeFontWeight,
    setNewtabTimeFontSize,
    setNewtabTimeOpacity,
    setNewtabTimeInk,
    setNewtabTimeFont,
    loadNewtabTimeFont,
    setNewtabTimeSecondsVisible,
    setNewtabTime12Hour
  };
}

type TopContentRuntime = ReturnType<typeof createTopContentRuntime>;

export { createTopContentRuntime };
export type { TopContentDeps, TopContentRuntime, TopContentState };
