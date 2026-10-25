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

  let inputModePrefixIconAnimation: Animation | null = null;
  let inputModePrefixIconAnimationElement: PrefixIcon | null = null;
  let inputModePrefixOutgoingIconAnimation: Animation | null = null;
  let ghostCount = 0;

  function getActivePrefixIcon(): PrefixIcon | undefined {
    const icons: PrefixIcon[] = [siteSearchPrefixLineIcon, siteSearchPrefixIconFrame, siteSearchPrefixGlyph];
    return icons.find((element) => isElementVisible(element));
  }

  function setInputModePrefixIdentity(prefixText: string, contentOptions?: PrefixContentOptions | null): void {
    updateModeTag({
      modeId: contentOptions && contentOptions.modeId ? String(contentOptions.modeId) : '',
      ariaLabel: getScopeLabel(formatMessage, prefixText)
    });
  }

  // Drops the fading copy; only the given one when a key is passed.
  function removeIconGhost(key?: number): void {
    const ghost = inputModeState.modeTag.ghost;
    if (ghost && (key === undefined || ghost.key === key)) {
      updateModeTag({ ghost: null });
    }
  }

  function cancelInputModePrefixIconAnimation(): void {
    const incomingAnimation = inputModePrefixIconAnimation;
    const incomingElement = inputModePrefixIconAnimationElement;
    const outgoingAnimation = inputModePrefixOutgoingIconAnimation;
    inputModePrefixIconAnimation = null;
    inputModePrefixIconAnimationElement = null;
    inputModePrefixOutgoingIconAnimation = null;
    if (incomingAnimation && typeof incomingAnimation.cancel === 'function') {
      incomingAnimation.cancel();
    }
    if (outgoingAnimation && typeof outgoingAnimation.cancel === 'function') {
      outgoingAnimation.cancel();
    }
    if (incomingElement) {
      setStyle(incomingElement, 'opacity', '1');
      setStyle(incomingElement, 'filter', 'none');
      setStyle(incomingElement, 'transform', 'none');
      setStyle(incomingElement, 'will-change', 'auto');
    }
    removeIconGhost();
  }

  // A copy of the shown icon over it, to fade out while the new one pops in.
  function createInputModePrefixIconGhost(animateIcon: boolean): ModeTagGhost | null {
    const icon = inputModeState.modeTag.icon;
    if (!animateIcon || !icon || shouldReduceInputModeMotion()) {
      return null;
    }
    const activeIcon = getActivePrefixIcon();
    if (!activeIcon) {
      return null;
    }
    const prefixRect = siteSearchPrefix.getBoundingClientRect();
    const iconRect = activeIcon.getBoundingClientRect();
    const layoutWidth = 'offsetWidth' in activeIcon ? Number(activeIcon.offsetWidth) : 0;
    const layoutHeight = 'offsetHeight' in activeIcon ? Number(activeIcon.offsetHeight) : 0;
    const iconLeft = Number(iconRect.left) - Number(prefixRect.left);
    const iconTop = Number(iconRect.top) - Number(prefixRect.top);
    ghostCount += 1;
    return {
      key: ghostCount,
      icon,
      showImage: activeIcon === siteSearchPrefixIconFrame,
      left: Number.isFinite(iconLeft) ? iconLeft : 0,
      top: Number.isFinite(iconTop) ? iconTop : 0,
      width: Number(iconRect.width) || layoutWidth || 16,
      height: Number(iconRect.height) || layoutHeight || 16
    };
  }

  function playInputModePrefixIconSwap(animateIcon: boolean, ghost: ModeTagGhost | null): void {
    const activeIcon = getActivePrefixIcon();
    if (!activeIcon) {
      removeIconGhost();
      return;
    }
    setStyle(activeIcon, 'opacity', '1');
    setStyle(activeIcon, 'filter', 'none');
    setStyle(activeIcon, 'transform', 'none');
    setStyle(activeIcon, 'transform-origin', 'center');
    setStyle(activeIcon, 'will-change', 'auto');
    if (!animateIcon || shouldReduceInputModeMotion() || !isAnimatable(activeIcon)) {
      removeIconGhost();
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
      duration: DEFAULT_PREFIX_ICON_POP_DURATION,
      easing: DEFAULT_PREFIX_ICON_POP_EASING
    });
    inputModePrefixIconAnimation = animation;
    inputModePrefixIconAnimationElement = activeIcon;
    setStyle(activeIcon, 'will-change', 'opacity, transform');
    animation.onfinish = () => {
      if (inputModePrefixIconAnimation !== animation) {
        return;
      }
      inputModePrefixIconAnimation = null;
      inputModePrefixIconAnimationElement = null;
      setStyle(activeIcon, 'opacity', '1');
      setStyle(activeIcon, 'filter', 'none');
      setStyle(activeIcon, 'transform', 'none');
      setStyle(activeIcon, 'will-change', 'auto');
    };
    animation.oncancel = () => {
      if (inputModePrefixIconAnimation === animation) {
        inputModePrefixIconAnimation = null;
        inputModePrefixIconAnimationElement = null;
      }
    };
    const outgoingIcon = ghost ? siteSearchPrefix.querySelector('[data-search-input-mode-icon-ghost]') : null;
    if (!ghost || !isAnimatable(outgoingIcon)) {
      removeIconGhost();
      return;
    }
    outgoingIcon.style.setProperty('opacity', '1');
    outgoingIcon.style.setProperty('transform', 'none');
    outgoingIcon.style.setProperty('will-change', 'opacity, transform');
    const outgoingAnimation = outgoingIcon.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.84)' }
    ], {
      duration: DEFAULT_PREFIX_ICON_EXIT_DURATION,
      easing: DEFAULT_PREFIX_ICON_EXIT_EASING
    });
    inputModePrefixOutgoingIconAnimation = outgoingAnimation;
    const removeOutgoingIcon = (): void => {
      if (inputModePrefixOutgoingIconAnimation === outgoingAnimation) {
        inputModePrefixOutgoingIconAnimation = null;
      }
      removeIconGhost(ghost.key);
    };
    outgoingAnimation.onfinish = removeOutgoingIcon;
    outgoingAnimation.oncancel = removeOutgoingIcon;
  }

  // How wide the tag would be with this text.
  function measureInputModePrefixWidthForText(prefixText: string): number {
    const previousText = inputModeState.modeTag.text;
    updateModeTag({ text: String(prefixText || '') });
    const width = Number(siteSearchPrefix.getBoundingClientRect().width) || 0;
    updateModeTag({ text: previousText });
    return width;
  }

  function setInputModePrefixContent(prefixText: string, contentOptions?: PrefixContentOptions | null): void {
    const preserveIconAnimation = Boolean(
      contentOptions && contentOptions.preserveIconAnimation
    );
    const animateIcon = Boolean(contentOptions && contentOptions.animateIcon);
    const animateOutgoingIcon = Boolean(
      contentOptions && contentOptions.animateOutgoingIcon
    );
    let ghost: ModeTagGhost | null = null;
    if (!preserveIconAnimation) {
      cancelInputModePrefixIconAnimation();
      ghost = createInputModePrefixIconGhost(animateOutgoingIcon);
    }
    const lineIconName = contentOptions && contentOptions.menuIconName
      ? String(contentOptions.menuIconName).trim()
      : '';
    const icon: ModeTagIcon = {
      lineIcon: getModeLineIconPaths(lineIconName) ? lineIconName : '',
      glyphClass: contentOptions && contentOptions.iconClass
        ? String(contentOptions.iconClass).trim()
        : (contentOptions && contentOptions.isAi ? 'ri-search-ai-line' : 'ri-search-line'),
      iconUrl: String(resolveProviderIconUrl(
        contentOptions && contentOptions.provider,
        contentOptions && contentOptions.iconUrl || ''
      ) || '').trim(),
      iconHost: contentOptions && contentOptions.iconHost ? String(contentOptions.iconHost).trim() : ''
    };
    updateModeTag({
      text: prefixText,
      icon,
      iconFailed: false,
      currentText: formatMessage('search_scope_current', '当前'),
      modeId: contentOptions && contentOptions.modeId ? String(contentOptions.modeId) : '',
      ariaLabel: getScopeLabel(formatMessage, prefixText),
      ...(preserveIconAnimation ? {} : { ghost })
    });
    if (!preserveIconAnimation) {
      playInputModePrefixIconSwap(animateIcon, ghost);
    }
  }

  // The site icon failed: the glyph shows in its place.
  function handleModeTagIconError(): void {
    const { icon, iconFailed } = inputModeState.modeTag;
    if (!icon || iconFailed || !icon.iconUrl || getModeLineIconPaths(icon.lineIcon)) {
      return;
    }
    updateModeTag({ iconFailed: true });
    updatePrefixLayout();
  }

  function getInputModePrefixRenderedWidth(): number {
    if (!isElementVisible(siteSearchPrefix)) {
      return 0;
    }
    return Math.max(
      0,
      Number(siteSearchPrefix.getBoundingClientRect().width) || 0
    );
  }

  function getInputModePrefixCurrentVisualState(): PrefixCurrentVisualState {
    if (!isElementVisible(siteSearchPrefix)) {
      return { marginLeft: 0, width: 0 };
    }
    const width = Math.max(
      0,
      Number(siteSearchPrefixCurrent.getBoundingClientRect().width) || 0
    );
    const computedStyle = win && typeof win.getComputedStyle === 'function'
      ? win.getComputedStyle(siteSearchPrefixCurrent)
      : null;
    const marginLeft = computedStyle
      ? Number.parseFloat(computedStyle.marginLeft) || 0
      : 0;
    return { marginLeft, width };
  }

  return {
    setInputModePrefixIdentity,
    cancelInputModePrefixIconAnimation,
    measureInputModePrefixWidthForText,
    setInputModePrefixContent,
    handleModeTagIconError,
    getInputModePrefixRenderedWidth,
    getInputModePrefixCurrentVisualState
  };
}

type PrefixContentApi = ReturnType<typeof createPrefixContent>;

export { createPrefixContent };
export type { PrefixContentApi, PrefixContentDeps, PrefixContentState, PrefixCurrentVisualState };
