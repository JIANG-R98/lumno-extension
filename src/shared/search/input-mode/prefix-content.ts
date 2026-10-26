// The mode tag's content: its identity, text and icon, the icon swap with a
// fading copy of the previous icon, and measuring the tag. The React view
// (react/search/mode-tag.tsx) draws the content from the tag's model; the
// swap's motion runs here on the drawn icons.
import { getModeLineIconPaths } from './line-icons';
import type { ModeTagGhost, ModeTagIcon, ModeTagModel } from './mode-tag-model';
import type {
  FormatMessage,
  IsElementVisible,
  PrefixContentOptions,
  ResolveProviderIconUrl,
  SetStyle
} from './types';

// The controller state search-input-mode.ts shares with its modules.
interface PrefixContentState {
  modeTag: ModeTagModel;
}

interface PrefixContentDeps {
  siteSearchPrefix: HTMLElement;
  siteSearchPrefixLineIcon: SVGElement;
  siteSearchPrefixIconFrame: HTMLElement;
  siteSearchPrefixGlyph: HTMLElement;
  siteSearchPrefixCurrent: HTMLElement;
  formatMessage: FormatMessage;
  setStyle: SetStyle;
  shouldReduceInputModeMotion: () => boolean;
  isElementVisible: IsElementVisible;
  DEFAULT_PREFIX_ICON_POP_DURATION: number;
  DEFAULT_PREFIX_ICON_POP_EASING: string;
  DEFAULT_PREFIX_ICON_EXIT_DURATION: number;
  DEFAULT_PREFIX_ICON_EXIT_EASING: string;
  resolveProviderIconUrl: ResolveProviderIconUrl;
  updatePrefixLayout: () => void;
  updateModeTag: (patch: Partial<ModeTagModel>) => void;
  win: Partial<Pick<Window, 'getComputedStyle'>> | null | undefined;
  inputModeState: PrefixContentState;
}

// Where the "current" label sits and how wide it is.
interface PrefixCurrentVisualState {
  marginLeft: number;
  width: number;
}

type PrefixIcon = SVGElement | HTMLElement;

function isAnimatable(element: Element | null): element is Element & ElementCSSInlineStyle & Animatable {
  return Boolean(element && 'style' in element && 'animate' in element && typeof element.animate === 'function');
}

function getScopeLabel(formatMessage: FormatMessage, prefixText: string): string {
  return formatMessage(
    'search_scope_switcher_label',
    '搜索范围：{scope}。选择即可切换。',
    { scope: prefixText }
  );
}

interface PrefixContentContext {
  readonly siteSearchPrefix: PrefixContentDeps['siteSearchPrefix'];
  readonly siteSearchPrefixLineIcon: PrefixContentDeps['siteSearchPrefixLineIcon'];
  readonly siteSearchPrefixIconFrame: PrefixContentDeps['siteSearchPrefixIconFrame'];
  readonly siteSearchPrefixGlyph: PrefixContentDeps['siteSearchPrefixGlyph'];
  readonly siteSearchPrefixCurrent: PrefixContentDeps['siteSearchPrefixCurrent'];
  readonly formatMessage: PrefixContentDeps['formatMessage'];
  readonly setStyle: PrefixContentDeps['setStyle'];
  readonly shouldReduceInputModeMotion: PrefixContentDeps['shouldReduceInputModeMotion'];
  readonly isElementVisible: PrefixContentDeps['isElementVisible'];
  readonly DEFAULT_PREFIX_ICON_POP_DURATION: PrefixContentDeps['DEFAULT_PREFIX_ICON_POP_DURATION'];
  readonly DEFAULT_PREFIX_ICON_POP_EASING: PrefixContentDeps['DEFAULT_PREFIX_ICON_POP_EASING'];
  readonly DEFAULT_PREFIX_ICON_EXIT_DURATION: PrefixContentDeps['DEFAULT_PREFIX_ICON_EXIT_DURATION'];
  readonly DEFAULT_PREFIX_ICON_EXIT_EASING: PrefixContentDeps['DEFAULT_PREFIX_ICON_EXIT_EASING'];
  readonly resolveProviderIconUrl: PrefixContentDeps['resolveProviderIconUrl'];
  readonly updatePrefixLayout: PrefixContentDeps['updatePrefixLayout'];
  readonly updateModeTag: PrefixContentDeps['updateModeTag'];
  readonly win: PrefixContentDeps['win'];
  readonly inputModeState: PrefixContentDeps['inputModeState'];
  inputModePrefixIconAnimation: Animation | null;
  inputModePrefixIconAnimationElement: PrefixIcon | null;
  inputModePrefixOutgoingIconAnimation: Animation | null;
  ghostCount: number;
}

function getActivePrefixIcon(ctx: PrefixContentContext): PrefixIcon | undefined {
  const icons: PrefixIcon[] = [ctx.siteSearchPrefixLineIcon, ctx.siteSearchPrefixIconFrame, ctx.siteSearchPrefixGlyph];
  return icons.find((element) => ctx.isElementVisible(element));
}

function setInputModePrefixIdentity(ctx: PrefixContentContext, prefixText: string, contentOptions?: PrefixContentOptions | null): void {
  ctx.updateModeTag({
    modeId: contentOptions && contentOptions.modeId ? String(contentOptions.modeId) : '',
    ariaLabel: getScopeLabel(ctx.formatMessage, prefixText)
  });
}

// Drops the fading copy; only the given one when a key is passed.
function removeIconGhost(ctx: PrefixContentContext, key?: number): void {
  const ghost = ctx.inputModeState.modeTag.ghost;
  if (ghost && (key === undefined || ghost.key === key)) {
    ctx.updateModeTag({ ghost: null });
  }
}

function cancelInputModePrefixIconAnimation(ctx: PrefixContentContext): void {
  const incomingAnimation = ctx.inputModePrefixIconAnimation;
  const incomingElement = ctx.inputModePrefixIconAnimationElement;
  const outgoingAnimation = ctx.inputModePrefixOutgoingIconAnimation;
  ctx.inputModePrefixIconAnimation = null;
  ctx.inputModePrefixIconAnimationElement = null;
  ctx.inputModePrefixOutgoingIconAnimation = null;
  if (incomingAnimation && typeof incomingAnimation.cancel === 'function') {
    incomingAnimation.cancel();
  }
  if (outgoingAnimation && typeof outgoingAnimation.cancel === 'function') {
    outgoingAnimation.cancel();
  }
  if (incomingElement) {
    ctx.setStyle(incomingElement, 'opacity', '1');
    ctx.setStyle(incomingElement, 'filter', 'none');
    ctx.setStyle(incomingElement, 'transform', 'none');
    ctx.setStyle(incomingElement, 'will-change', 'auto');
  }
  removeIconGhost(ctx);
}

// A copy of the shown icon over it, to fade out while the new one pops in.
function createInputModePrefixIconGhost(ctx: PrefixContentContext, animateIcon: boolean): ModeTagGhost | null {
  const icon = ctx.inputModeState.modeTag.icon;
  if (!animateIcon || !icon || ctx.shouldReduceInputModeMotion()) {
    return null;
  }
  const activeIcon = getActivePrefixIcon(ctx);
  if (!activeIcon) {
    return null;
  }
  const prefixRect = ctx.siteSearchPrefix.getBoundingClientRect();
  const iconRect = activeIcon.getBoundingClientRect();
  const layoutWidth = 'offsetWidth' in activeIcon ? Number(activeIcon.offsetWidth) : 0;
  const layoutHeight = 'offsetHeight' in activeIcon ? Number(activeIcon.offsetHeight) : 0;
  const iconLeft = Number(iconRect.left) - Number(prefixRect.left);
  const iconTop = Number(iconRect.top) - Number(prefixRect.top);
  ctx.ghostCount += 1;
  return {
    key: ctx.ghostCount,
    icon,
    showImage: activeIcon === ctx.siteSearchPrefixIconFrame,
    left: Number.isFinite(iconLeft) ? iconLeft : 0,
    top: Number.isFinite(iconTop) ? iconTop : 0,
    width: Number(iconRect.width) || layoutWidth || 16,
    height: Number(iconRect.height) || layoutHeight || 16
  };
}

function playInputModePrefixIconSwap(ctx: PrefixContentContext, animateIcon: boolean, ghost: ModeTagGhost | null): void {
  const activeIcon = getActivePrefixIcon(ctx);
  if (!activeIcon) {
    removeIconGhost(ctx);
    return;
  }
  ctx.setStyle(activeIcon, 'opacity', '1');
  ctx.setStyle(activeIcon, 'filter', 'none');
  ctx.setStyle(activeIcon, 'transform', 'none');
  ctx.setStyle(activeIcon, 'transform-origin', 'center');
  ctx.setStyle(activeIcon, 'will-change', 'auto');
  if (!animateIcon || ctx.shouldReduceInputModeMotion() || !isAnimatable(activeIcon)) {
    removeIconGhost(ctx);
    return;
  }
  const animation = activeIcon.animate([
    {
      opacity: 0.45,
      offset: 0,
      transform: 'scale(0.84)'
    },
    {
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      opacity: 1,
      offset: 0.62,
      transform: 'scale(1.05)'
    },
    {
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      opacity: 1,
      offset: 0.84,
      transform: 'scale(0.99)'
    },
    { opacity: 1, offset: 1, transform: 'scale(1)' }
  ], {
    duration: ctx.DEFAULT_PREFIX_ICON_POP_DURATION,
    easing: ctx.DEFAULT_PREFIX_ICON_POP_EASING
  });
  ctx.inputModePrefixIconAnimation = animation;
  ctx.inputModePrefixIconAnimationElement = activeIcon;
  ctx.setStyle(activeIcon, 'will-change', 'opacity, transform');
  animation.onfinish = () => {
    if (ctx.inputModePrefixIconAnimation !== animation) {
      return;
    }
    ctx.inputModePrefixIconAnimation = null;
    ctx.inputModePrefixIconAnimationElement = null;
    ctx.setStyle(activeIcon, 'opacity', '1');
    ctx.setStyle(activeIcon, 'filter', 'none');
    ctx.setStyle(activeIcon, 'transform', 'none');
    ctx.setStyle(activeIcon, 'will-change', 'auto');
  };
  animation.oncancel = () => {
    if (ctx.inputModePrefixIconAnimation === animation) {
      ctx.inputModePrefixIconAnimation = null;
      ctx.inputModePrefixIconAnimationElement = null;
    }
  };
  const outgoingIcon = ghost ? ctx.siteSearchPrefix.querySelector('[data-search-input-mode-icon-ghost]') : null;
  if (!ghost || !isAnimatable(outgoingIcon)) {
    removeIconGhost(ctx);
    return;
  }
  outgoingIcon.style.setProperty('opacity', '1');
  outgoingIcon.style.setProperty('transform', 'none');
  outgoingIcon.style.setProperty('will-change', 'opacity, transform');
  const outgoingAnimation = outgoingIcon.animate([
    { opacity: 1, transform: 'scale(1)' },
    { opacity: 0, transform: 'scale(0.84)' }
  ], {
    duration: ctx.DEFAULT_PREFIX_ICON_EXIT_DURATION,
    easing: ctx.DEFAULT_PREFIX_ICON_EXIT_EASING
  });
  ctx.inputModePrefixOutgoingIconAnimation = outgoingAnimation;
  const removeOutgoingIcon = (): void => {
    if (ctx.inputModePrefixOutgoingIconAnimation === outgoingAnimation) {
      ctx.inputModePrefixOutgoingIconAnimation = null;
    }
    removeIconGhost(ctx, ghost.key);
  };
  outgoingAnimation.onfinish = removeOutgoingIcon;
  outgoingAnimation.oncancel = removeOutgoingIcon;
}

// How wide the tag would be with this text.
function measureInputModePrefixWidthForText(ctx: PrefixContentContext, prefixText: string): number {
  const previousText = ctx.inputModeState.modeTag.text;
  ctx.updateModeTag({ text: String(prefixText || '') });
  const width = Number(ctx.siteSearchPrefix.getBoundingClientRect().width) || 0;
  ctx.updateModeTag({ text: previousText });
  return width;
}

// The icon a mode tag shows: a line icon from the menu, the site's icon,
// or the search glyph.
function readModeTagIcon(ctx: PrefixContentContext, options: PrefixContentOptions): ModeTagIcon {
  const lineIconName = options.menuIconName ? String(options.menuIconName).trim() : '';
  return {
    lineIcon: getModeLineIconPaths(lineIconName) ? lineIconName : '',
    glyphName: options.iconName || (options.isAi ? 'ri-search-ai-line' : 'ri-search-line'),
    iconUrl: String(ctx.resolveProviderIconUrl(options.provider, options.iconUrl || '') || '').trim(),
    iconHost: options.iconHost ? String(options.iconHost).trim() : ''
  };
}

function setInputModePrefixContent(ctx: PrefixContentContext, prefixText: string, contentOptions?: PrefixContentOptions | null): void {
  const options: PrefixContentOptions = contentOptions || {};
  const preserveIconAnimation = Boolean(options.preserveIconAnimation);
  let ghost: ModeTagGhost | null = null;
  if (!preserveIconAnimation) {
    cancelInputModePrefixIconAnimation(ctx);
    ghost = createInputModePrefixIconGhost(ctx, Boolean(options.animateOutgoingIcon));
  }
  ctx.updateModeTag({
    text: prefixText,
    icon: readModeTagIcon(ctx, options),
    iconFailed: false,
    currentText: ctx.formatMessage('search_scope_current', '当前'),
    modeId: options.modeId ? String(options.modeId) : '',
    ariaLabel: getScopeLabel(ctx.formatMessage, prefixText),
    ...(preserveIconAnimation ? {} : { ghost })
  });
  if (!preserveIconAnimation) {
    playInputModePrefixIconSwap(ctx, Boolean(options.animateIcon), ghost);
  }
}

// The site icon failed: the glyph shows in its place.
function handleModeTagIconError(ctx: PrefixContentContext): void {
  const { icon, iconFailed } = ctx.inputModeState.modeTag;
  if (!icon || iconFailed || !icon.iconUrl || getModeLineIconPaths(icon.lineIcon)) {
    return;
  }
  ctx.updateModeTag({ iconFailed: true });
  ctx.updatePrefixLayout();
}

function getInputModePrefixRenderedWidth(ctx: PrefixContentContext): number {
  if (!ctx.isElementVisible(ctx.siteSearchPrefix)) {
    return 0;
  }
  return Math.max(
    0,
    Number(ctx.siteSearchPrefix.getBoundingClientRect().width) || 0
  );
}

function getInputModePrefixCurrentVisualState(ctx: PrefixContentContext): PrefixCurrentVisualState {
  if (!ctx.isElementVisible(ctx.siteSearchPrefix)) {
    return { marginLeft: 0, width: 0 };
  }
  const width = Math.max(
    0,
    Number(ctx.siteSearchPrefixCurrent.getBoundingClientRect().width) || 0
  );
  const computedStyle = ctx.win && typeof ctx.win.getComputedStyle === 'function'
    ? ctx.win.getComputedStyle(ctx.siteSearchPrefixCurrent)
    : null;
  const marginLeft = computedStyle
    ? Number.parseFloat(computedStyle.marginLeft) || 0
    : 0;
  return { marginLeft, width };
}

function createPrefixContent(deps: PrefixContentDeps) {
  const {
    siteSearchPrefix,
    siteSearchPrefixLineIcon,
    siteSearchPrefixIconFrame,
    siteSearchPrefixGlyph,
    siteSearchPrefixCurrent,
    formatMessage,
    setStyle,
    shouldReduceInputModeMotion,
    isElementVisible,
    DEFAULT_PREFIX_ICON_POP_DURATION,
    DEFAULT_PREFIX_ICON_POP_EASING,
    DEFAULT_PREFIX_ICON_EXIT_DURATION,
    DEFAULT_PREFIX_ICON_EXIT_EASING,
    resolveProviderIconUrl,
    updatePrefixLayout,
    updateModeTag,
    win
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;
  const ctx: PrefixContentContext = {
    siteSearchPrefix,
    siteSearchPrefixLineIcon,
    siteSearchPrefixIconFrame,
    siteSearchPrefixGlyph,
    siteSearchPrefixCurrent,
    formatMessage,
    setStyle,
    shouldReduceInputModeMotion,
    isElementVisible,
    DEFAULT_PREFIX_ICON_POP_DURATION,
    DEFAULT_PREFIX_ICON_POP_EASING,
    DEFAULT_PREFIX_ICON_EXIT_DURATION,
    DEFAULT_PREFIX_ICON_EXIT_EASING,
    resolveProviderIconUrl,
    updatePrefixLayout,
    updateModeTag,
    win,
    inputModeState,
    inputModePrefixIconAnimation: null,
    inputModePrefixIconAnimationElement: null,
    inputModePrefixOutgoingIconAnimation: null,
    ghostCount: 0
  };

  return {
    setInputModePrefixIdentity: (prefixText: string, contentOptions?: PrefixContentOptions | null) => setInputModePrefixIdentity(ctx, prefixText, contentOptions),
    cancelInputModePrefixIconAnimation: () => cancelInputModePrefixIconAnimation(ctx),
    measureInputModePrefixWidthForText: (prefixText: string) => measureInputModePrefixWidthForText(ctx, prefixText),
    setInputModePrefixContent: (prefixText: string, contentOptions?: PrefixContentOptions | null) => setInputModePrefixContent(ctx, prefixText, contentOptions),
    handleModeTagIconError: () => handleModeTagIconError(ctx),
    getInputModePrefixRenderedWidth: () => getInputModePrefixRenderedWidth(ctx),
    getInputModePrefixCurrentVisualState: () => getInputModePrefixCurrentVisualState(ctx)
  };
}

type PrefixContentApi = ReturnType<typeof createPrefixContent>;

export { createPrefixContent };
export type { PrefixContentApi, PrefixContentDeps, PrefixContentState, PrefixCurrentVisualState };
