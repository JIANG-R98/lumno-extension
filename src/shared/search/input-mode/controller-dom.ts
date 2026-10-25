// Sets up the mode prefix with its icon, glyph and chevron.
import type { CssText } from './types';

interface ControllerDomDeps {
  siteSearchPrefix: HTMLElement;
  siteSearchPrefixIcon: HTMLElement;
  siteSearchPrefixText: HTMLElement;
  siteSearchTabHint: HTMLElement;
  siteSearchTabHintKey: HTMLElement;
  siteSearchTabHintText: HTMLElement;
  prefixId: string;
  siteSearchPrefixIconFrame: HTMLElement;
  siteSearchPrefixGlyph: HTMLElement;
  siteSearchPrefixLineIcon: SVGElement;
  cssText: CssText;
  siteSearchPrefixChevron: HTMLElement;
  siteSearchPrefixCurrent: HTMLElement;
  siteSearchPrefixCurrentText: HTMLElement;
  DEFAULT_PREFIX_ITEM_GAP_PX: number;
  INPUT_FONT_STACK: string;
  prefixTransition: string;
}

function createControllerDom(deps: ControllerDomDeps): void {
  const {
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
    siteSearchPrefixChevron,
    siteSearchPrefixCurrent,
    siteSearchPrefixCurrentText,
    DEFAULT_PREFIX_ITEM_GAP_PX,
    INPUT_FONT_STACK,
    prefixTransition
  } = deps;

  if (!siteSearchPrefix || !siteSearchPrefixIcon || !siteSearchPrefixText ||
      !siteSearchTabHint || !siteSearchTabHintKey || !siteSearchTabHintText) {
    throw new Error('createInputModeController requires React input mode parts');
  }
  siteSearchPrefix.id = prefixId;
  siteSearchPrefix.className = 'x-lumno-search-input-mode__prefix';
  siteSearchPrefix.setAttribute('type', 'button');
  siteSearchPrefix.setAttribute('aria-haspopup', 'menu');
  siteSearchPrefix.setAttribute('aria-expanded', 'false');
  siteSearchPrefix.setAttribute('aria-controls', `${prefixId}-menu`);
  siteSearchPrefix.setAttribute('data-menu-open', 'false');
  siteSearchPrefix.setAttribute('data-current-visible', 'false');
  siteSearchPrefix.setAttribute('data-current-measuring', 'false');
  siteSearchPrefixIconFrame.className = 'x-lumno-search-input-mode__prefix-icon-frame';
  siteSearchPrefixIconFrame.setAttribute('data-search-input-mode-prefix-icon-frame', '');
  if (!siteSearchPrefixIconFrame.parentNode) {
    const iconParent = siteSearchPrefixIcon.parentNode;
    if (iconParent) {
      iconParent.insertBefore(siteSearchPrefixIconFrame, siteSearchPrefixIcon);
    } else {
      siteSearchPrefix.insertBefore(siteSearchPrefixIconFrame, siteSearchPrefixText);
    }
  }
  if (siteSearchPrefixIcon.parentNode !== siteSearchPrefixIconFrame) {
    siteSearchPrefixIconFrame.appendChild(siteSearchPrefixIcon);
  }
  if (!siteSearchPrefixGlyph.parentNode) {
    siteSearchPrefix.insertBefore(siteSearchPrefixGlyph, siteSearchPrefixText);
  }
  siteSearchPrefixLineIcon.setAttribute('aria-hidden', 'true');
  siteSearchPrefixLineIcon.setAttribute('class', 'x-lumno-search-input-mode__prefix-line-icon');
  siteSearchPrefixLineIcon.setAttribute('data-search-input-mode-line-icon', '');
  siteSearchPrefixLineIcon.style.cssText = cssText([
    ['display', 'none'],
    ['width', '16px'],
    ['height', '16px'],
    ['flex', '0 0 16px']
  ]);
  if (!siteSearchPrefixLineIcon.parentNode) {
    siteSearchPrefix.insertBefore(siteSearchPrefixLineIcon, siteSearchPrefixText);
  }
  if (!siteSearchPrefixChevron.parentNode) {
    siteSearchPrefix.appendChild(siteSearchPrefixChevron);
  }
  if (!siteSearchPrefixCurrent.parentNode) {
    siteSearchPrefix.insertBefore(siteSearchPrefixCurrent, siteSearchPrefixChevron);
  }
  if (!siteSearchPrefixCurrentText.parentNode) {
    siteSearchPrefixCurrent.appendChild(siteSearchPrefixCurrentText);
  }
  siteSearchPrefixCurrentText.style.setProperty('display', 'inline-block');
  siteSearchPrefixCurrent.setAttribute('aria-hidden', 'true');
  siteSearchPrefixCurrent.setAttribute('data-search-input-mode-current', '');
  siteSearchPrefixCurrentText.setAttribute('data-search-input-mode-current-text', '');
  siteSearchPrefixGlyph.setAttribute('aria-hidden', 'true');
  siteSearchPrefixChevron.setAttribute('aria-hidden', 'true');
  siteSearchPrefixChevron.className = 'ri-icon ri-size-16 ri-arrow-down-s-line';
  siteSearchPrefix.style.cssText = cssText([
    ['all', 'unset'],
    ['position', 'absolute'],
    ['top', '50%'],
    ['transform', 'translateY(-50%)'],
    ['transform-origin', 'left center'],
    ['left', '50px'],
    ['display', 'none'],
    ['align-items', 'center'],
    ['justify-content', 'flex-start'],
    ['gap', `${DEFAULT_PREFIX_ITEM_GAP_PX}px`],
    ['max-width', 'min(220px, 48%)'],
    ['min-width', '0'],
    ['box-sizing', 'border-box'],
    ['height', '32px'],
    ['padding', '0 6px'],
    ['white-space', 'nowrap'],
    ['overflow', 'hidden'],
    ['text-overflow', 'ellipsis'],
    ['font-size', '13px'],
    ['font-family', INPUT_FONT_STACK],
    ['font-weight', '700'],
    ['line-height', '1'],
    ['letter-spacing', '0'],
    ['color', '#F8FAFC'],
    ['background', '#3B82F6'],
    ['border', 'none'],
    ['border-radius', '10px'],
    ['corner-shape', 'superellipse(1.25)'],
    ['box-shadow', 'none'],
    ['opacity', '1'],
    ['transition', prefixTransition],
    ['will-change', 'auto'],
    ['cursor', 'pointer'],
    ['pointer-events', 'auto'],
    ['z-index', '1'],
    ['user-select', 'none']
  ]);
}

export { createControllerDom };
export type { ControllerDomDeps };
