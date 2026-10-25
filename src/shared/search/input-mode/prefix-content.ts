// The mode prefix's content: its identity, the icon swap with a ghost of
// the previous icon, and measuring and setting its text and icon.
import type {
  AttachFaviconData,
  CssText,
  FormatMessage,
  IsElementVisible,
  PrefixContentOptions,
  ResolveProviderIconUrl,
  SetStyle
} from './types';

// The controller state search-input-mode.ts shares with its modules.
interface PrefixContentState {
  // Counts content changes, so a late icon failure knows it is stale.
  inputModePrefixContentRevision: number;
}

interface PrefixContentDeps {
  siteSearchPrefix: HTMLElement;
  formatMessage: FormatMessage;
  setStyle: SetStyle;
  shouldReduceInputModeMotion: () => boolean;
  siteSearchPrefixLineIcon: SVGElement;
  siteSearchPrefixIconFrame: HTMLElement;
  siteSearchPrefixGlyph: HTMLElement;
  isElementVisible: IsElementVisible;
  DEFAULT_PREFIX_ICON_POP_DURATION: number;
  DEFAULT_PREFIX_ICON_POP_EASING: string;
  DEFAULT_PREFIX_ICON_EXIT_DURATION: number;
  DEFAULT_PREFIX_ICON_EXIT_EASING: string;
  siteSearchPrefixText: HTMLElement;
  resolveProviderIconUrl: ResolveProviderIconUrl;
  renderModeLineIconSvg: (svg: Element | null | undefined, lineIconName: string, strokeWidth?: string) => boolean;
  siteSearchPrefixIcon: HTMLImageElement;
  cssText: CssText;
  updatePrefixLayout: () => void;
  attachFaviconData: AttachFaviconData | null;
  siteSearchPrefixCurrentText: HTMLElement;
  siteSearchPrefixCurrent: HTMLElement;
  siteSearchPrefixChevron: HTMLElement;
  win: Partial<Pick<Window, 'getComputedStyle'>> | null | undefined;
  inputModeState: PrefixContentState;
}

// Where the "current" label sits and how wide it is.
interface PrefixCurrentVisualState {
  marginLeft: number;
  width: number;
}

type PrefixIcon = SVGElement | HTMLElement;

// An element node with an inline style; nodeType 1 is an element.
function isStyledElement(node: Node): node is Element & ElementCSSInlineStyle {
  return node.nodeType === 1 && 'style' in node;
}

function createPrefixContent(deps: PrefixContentDeps) {
  const {
    siteSearchPrefix,
    formatMessage,
    setStyle,
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
    updatePrefixLayout,
    attachFaviconData,
    siteSearchPrefixCurrentText,
    siteSearchPrefixCurrent,
    siteSearchPrefixChevron,
    win
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  let inputModePrefixIconAnimation: Animation | null = null;
  let inputModePrefixIconAnimationElement: PrefixIcon | null = null;
  let inputModePrefixIconGhost: Element | null = null;
  let inputModePrefixOutgoingIconAnimation: Animation | null = null;

  function getActivePrefixIcon(): PrefixIcon | undefined {
    const icons: PrefixIcon[] = [siteSearchPrefixLineIcon, siteSearchPrefixIconFrame, siteSearchPrefixGlyph];
    return icons.find((element) => isElementVisible(element));
  }

  function setInputModePrefixIdentity(prefixText: string, contentOptions?: PrefixContentOptions | null): void {
    siteSearchPrefix.setAttribute(
      'data-mode-id',
      contentOptions && contentOptions.modeId ? String(contentOptions.modeId) : ''
    );
    siteSearchPrefix.setAttribute('aria-label', formatMessage(
      'search_scope_switcher_label',
      '搜索范围：{scope}。选择即可切换。',
      { scope: prefixText }
    ));
  }

  function cancelInputModePrefixIconAnimation(): void {
    const incomingAnimation = inputModePrefixIconAnimation;
    const incomingElement = inputModePrefixIconAnimationElement;
    const outgoingAnimation = inputModePrefixOutgoingIconAnimation;
    const outgoingIcon = inputModePrefixIconGhost;
    inputModePrefixIconAnimation = null;
    inputModePrefixIconAnimationElement = null;
    inputModePrefixIconGhost = null;
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
    if (outgoingIcon && outgoingIcon.parentNode) {
      outgoingIcon.parentNode.removeChild(outgoingIcon);
    }
  }

  // A copy of the shown icon over it, to fade out while the new one pops in.
  function createInputModePrefixIconGhost(animateIcon: boolean): (Element & ElementCSSInlineStyle) | null {
    if (!animateIcon || shouldReduceInputModeMotion()) {
      return null;
    }
    const activeIcon = getActivePrefixIcon();
    if (!activeIcon || typeof activeIcon.cloneNode !== 'function') {
      return null;
    }
    const ghost = activeIcon.cloneNode(true);
    if (!isStyledElement(ghost)) {
      return null;
    }
    const prefixRect = siteSearchPrefix.getBoundingClientRect();
    const iconRect = activeIcon.getBoundingClientRect();
    const layoutWidth = 'offsetWidth' in activeIcon ? Number(activeIcon.offsetWidth) : 0;
    const layoutHeight = 'offsetHeight' in activeIcon ? Number(activeIcon.offsetHeight) : 0;
    const iconWidth = Number(iconRect.width) || layoutWidth || 16;
    const iconHeight = Number(iconRect.height) || layoutHeight || 16;
    const iconLeft = Number(iconRect.left) - Number(prefixRect.left);
    const iconTop = Number(iconRect.top) - Number(prefixRect.top);
    ghost.removeAttribute('id');
    ghost.removeAttribute('data-search-input-mode-line-icon');
    ghost.removeAttribute('data-search-input-mode-prefix-glyph');
    ghost.removeAttribute('data-search-input-mode-prefix-icon');
    ghost.removeAttribute('data-search-input-mode-prefix-icon-frame');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-search-input-mode-icon-ghost', '');
    setStyle(ghost, 'position', 'absolute');
    setStyle(ghost, 'left', `${Number.isFinite(iconLeft) ? iconLeft : 0}px`);
    setStyle(ghost, 'top', `${Number.isFinite(iconTop) ? iconTop : 0}px`);
    setStyle(ghost, 'width', `${iconWidth}px`);
    setStyle(ghost, 'height', `${iconHeight}px`);
    setStyle(ghost, 'display', 'inline-flex');
    setStyle(ghost, 'align-items', 'center');
    setStyle(ghost, 'justify-content', 'center');
    setStyle(ghost, 'pointer-events', 'none');
    setStyle(ghost, 'opacity', '1');
    setStyle(ghost, 'filter', 'none');
    setStyle(ghost, 'transform', 'none');
    setStyle(ghost, 'transform-origin', 'center');
    setStyle(ghost, 'will-change', 'opacity, transform');
    setStyle(ghost, 'z-index', '2');
    siteSearchPrefix.appendChild(ghost);
    return ghost;
  }

  function playInputModePrefixIconSwap(
    animateIcon: boolean,
    outgoingIcon: (Element & ElementCSSInlineStyle) | null
  ): void {
    const activeIcon = getActivePrefixIcon();
    if (!activeIcon) {
      if (outgoingIcon && outgoingIcon.parentNode) {
        outgoingIcon.parentNode.removeChild(outgoingIcon);
      }
      return;
    }
    setStyle(activeIcon, 'opacity', '1');
    setStyle(activeIcon, 'filter', 'none');
    setStyle(activeIcon, 'transform', 'none');
    setStyle(activeIcon, 'transform-origin', 'center');
    setStyle(activeIcon, 'will-change', 'auto');
    if (!animateIcon || shouldReduceInputModeMotion() ||
        typeof activeIcon.animate !== 'function') {
      if (outgoingIcon && outgoingIcon.parentNode) {
        outgoingIcon.parentNode.removeChild(outgoingIcon);
      }
      return;
    }
    activeIcon.style.setProperty('opacity', '1');
    activeIcon.style.setProperty('filter', 'none');
    activeIcon.style.setProperty('transform', 'none');
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
    if (!outgoingIcon || typeof outgoingIcon.animate !== 'function') {
      if (outgoingIcon && outgoingIcon.parentNode) {
        outgoingIcon.parentNode.removeChild(outgoingIcon);
      }
      return;
    }
    outgoingIcon.style.setProperty('opacity', '1');
    outgoingIcon.style.setProperty('transform', 'none');
    const outgoingAnimation = outgoingIcon.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.84)' }
    ], {
      duration: DEFAULT_PREFIX_ICON_EXIT_DURATION,
      easing: DEFAULT_PREFIX_ICON_EXIT_EASING
    });
    inputModePrefixIconGhost = outgoingIcon;
    inputModePrefixOutgoingIconAnimation = outgoingAnimation;
    const removeOutgoingIcon = (): void => {
      if (inputModePrefixOutgoingIconAnimation === outgoingAnimation) {
        inputModePrefixOutgoingIconAnimation = null;
      }
      if (inputModePrefixIconGhost === outgoingIcon) {
        inputModePrefixIconGhost = null;
      }
      if (outgoingIcon.parentNode) {
        outgoingIcon.parentNode.removeChild(outgoingIcon);
      }
    };
    outgoingAnimation.onfinish = removeOutgoingIcon;
    outgoingAnimation.oncancel = removeOutgoingIcon;
  }

  function measureInputModePrefixWidthForText(prefixText: string): number {
    const previousText = String(siteSearchPrefixText.textContent || '');
    siteSearchPrefixText.textContent = String(prefixText || '');
    const width = Number(siteSearchPrefix.getBoundingClientRect().width) || 0;
    siteSearchPrefixText.textContent = previousText;
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
    let outgoingIcon: (Element & ElementCSSInlineStyle) | null = null;
    if (!preserveIconAnimation) {
      cancelInputModePrefixIconAnimation();
      outgoingIcon = createInputModePrefixIconGhost(animateOutgoingIcon);
    }
    const contentRevision = ++inputModeState.inputModePrefixContentRevision;
    const iconUrl = String(resolveProviderIconUrl(
      contentOptions && contentOptions.provider,
      contentOptions && contentOptions.iconUrl || ''
    ) || '').trim();
    const iconClass = contentOptions && contentOptions.iconClass
      ? String(contentOptions.iconClass).trim()
      : (contentOptions && contentOptions.isAi ? 'ri-search-ai-line' : 'ri-search-line');
    const lineIconName = contentOptions && contentOptions.menuIconName
      ? String(contentOptions.menuIconName).trim()
      : '';
    const hasBuiltInLineIcon = renderModeLineIconSvg(
      siteSearchPrefixLineIcon,
      lineIconName,
      '2'
    );
    if (hasBuiltInLineIcon) {
      setStyle(siteSearchPrefixLineIcon, 'display', 'inline-flex');
      setStyle(siteSearchPrefixGlyph, 'display', 'none');
      setStyle(siteSearchPrefixIconFrame, 'display', 'none');
      setStyle(siteSearchPrefixIcon, 'display', 'none');
      siteSearchPrefixIcon.removeAttribute('src');
    } else {
      setStyle(siteSearchPrefixLineIcon, 'display', 'none');
      siteSearchPrefixGlyph.className = `ri-icon ri-size-16 ${iconClass}`;
      setStyle(siteSearchPrefixGlyph, 'display', 'inline-flex');
      setStyle(siteSearchPrefixGlyph, 'flex', '0 0 auto');
    }
    if (!hasBuiltInLineIcon && iconUrl) {
      const icon = siteSearchPrefixIcon;
      siteSearchPrefixIconFrame.style.cssText = cssText([
        ['all', 'unset'],
        ['position', 'relative'],
        ['width', '20px'],
        ['height', '20px'],
        ['border-radius', '6px'],
        ['clip-path', 'inset(0 round 6px)'],
        ['overflow', 'hidden'],
        ['isolation', 'isolate'],
        ['flex', '0 0 20px'],
        ['display', 'inline-flex']
      ]);
      icon.alt = '';
      icon.decoding = 'async';
      icon.referrerPolicy = 'no-referrer';
      icon.style.cssText = cssText([
        ['all', 'unset'],
        ['width', '20px'],
        ['height', '20px'],
        ['border-radius', '6px'],
        ['clip-path', 'inset(0 round 6px)'],
        ['overflow', 'hidden'],
        ['object-fit', 'contain'],
        ['flex', '0 0 auto'],
        ['display', 'block']
      ]);
      setStyle(siteSearchPrefixGlyph, 'display', 'none');
      const removeUnavailableIcon = (): void => {
        if (contentRevision !== inputModeState.inputModePrefixContentRevision) {
          return;
        }
        setStyle(siteSearchPrefixIconFrame, 'display', 'none');
        setStyle(icon, 'display', 'none');
        icon.removeAttribute('src');
        setStyle(siteSearchPrefixGlyph, 'display', 'inline-flex');
        updatePrefixLayout();
      };
      const iconHost = contentOptions && contentOptions.iconHost ? String(contentOptions.iconHost || '').trim() : '';
      icon.addEventListener('error', removeUnavailableIcon, { once: true });
      icon.src = iconUrl;
      if (attachFaviconData && !iconUrl.startsWith('data:')) {
        attachFaviconData(icon, iconUrl, iconHost);
      }
    } else if (!hasBuiltInLineIcon) {
      setStyle(siteSearchPrefixIconFrame, 'display', 'none');
      setStyle(siteSearchPrefixIcon, 'display', 'none');
      siteSearchPrefixIcon.removeAttribute('src');
    }
    setStyle(siteSearchPrefixIcon, 'transition', 'none');
    setStyle(siteSearchPrefixIconFrame, 'transition', 'none');
    setStyle(siteSearchPrefixGlyph, 'transition', 'none');
    setStyle(siteSearchPrefixLineIcon, 'transition', 'none');
    const text = siteSearchPrefixText;
    text.textContent = prefixText;
    text.style.cssText = cssText([
      ['all', 'unset'],
      ['display', 'block'],
      ['flex', '0 1 auto'],
      ['min-width', '0'],
      ['overflow', 'hidden'],
      ['text-overflow', 'ellipsis'],
      ['white-space', 'nowrap'],
      ['line-height', '18px']
    ]);
    siteSearchPrefixCurrentText.textContent = formatMessage(
      'search_scope_current',
      '当前'
    );
    const currentLabelVisible = siteSearchPrefix.getAttribute(
      'data-current-visible'
    ) === 'true';
    siteSearchPrefixCurrent.style.cssText = cssText([
      ['all', 'unset'],
      ['display', currentLabelVisible ? 'inline-flex' : 'none'],
      ['align-items', 'center'],
      ['font-size', '13px'],
      ['font-weight', '600'],
      ['line-height', '18px'],
      ['letter-spacing', '0.04em'],
      ['white-space', 'nowrap'],
      ['overflow', 'hidden'],
      ['flex', '0 0 auto']
    ]);
    setInputModePrefixIdentity(prefixText, contentOptions);
    setStyle(siteSearchPrefixChevron, 'display', 'inline-flex');
    setStyle(siteSearchPrefixChevron, 'flex', '0 0 auto');
    if (!preserveIconAnimation) {
      playInputModePrefixIconSwap(animateIcon, outgoingIcon);
    }
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
    getInputModePrefixRenderedWidth,
    getInputModePrefixCurrentVisualState
  };
}

type PrefixContentApi = ReturnType<typeof createPrefixContent>;

export { createPrefixContent };
export type { PrefixContentApi, PrefixContentDeps, PrefixContentState, PrefixCurrentVisualState };
