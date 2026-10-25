// Builds the controller's elements: the mode prefix with its icon, glyph
// and chevron, the mode menu surface with its content and footer hints.
import type * as LumnoMenuSurface from '../../ui/menu-surface';
import type { CssDeclaration, CssText, InputModeVars, SetStyle } from './types';
import { queryHtmlElement } from '../../dom-lookup';

// The menu parts this module finds or creates; search-input-mode.ts keeps
// them in the state it shares with its modules.
interface ControllerDomParts {
  modeMenuContent: HTMLElement;
  modeMenuFooter: HTMLElement;
  modeMenuFooterFilterText: HTMLElement;
  modeMenuFooterNavigationKey: HTMLElement;
  modeMenuFooterNavigationText: HTMLElement;
  modeMenuFooterSelectKey: HTMLElement;
  modeMenuFooterSelectText: HTMLElement;
  modeMenuFooterInputKey: HTMLElement;
  modeMenuFooterInputText: HTMLElement;
  modeMenuFooterKey: HTMLElement;
  modeMenuFooterText: HTMLElement;
}

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
  useImportantStyles: boolean;
  siteSearchPrefixChevron: HTMLElement;
  siteSearchPrefixCurrent: HTMLElement;
  siteSearchPrefixCurrentText: HTMLElement;
  DEFAULT_PREFIX_ITEM_GAP_PX: number;
  INPUT_FONT_STACK: string;
  prefixTransition: string;
  setStyle: SetStyle;
  modeMenu: HTMLElement;
  menuSurfaceClass: string;
  menuSurface: Pick<typeof LumnoMenuSurface, 'apply'>;
  surface: 'newtab' | 'overlay';
  vars: InputModeVars;
  container: HTMLElement;
  applyNoTranslate: <T extends Element>(element: T) => T;
  doc: Document;
}

// The footer's hints: filter text, then Move, Switch, Switch focus and
// Open panel, each a key and its words.
interface FooterParts {
  filterText: HTMLElement;
  actions: HTMLElement;
  navigationHint: HTMLElement;
  navigationKey: HTMLElement;
  navigationText: HTMLElement;
  selectHint: HTMLElement;
  selectKey: HTMLElement;
  selectText: HTMLElement;
  inputHint: HTMLElement;
  inputKey: HTMLElement;
  inputText: HTMLElement;
  shortcutHint: HTMLElement;
  shortcutKey: HTMLElement;
  shortcutText: HTMLElement;
}

function findPart(root: HTMLElement, attribute: string): HTMLElement | null {
  return queryHtmlElement(root, `[${attribute}]`);
}

function createControllerDom(deps: ControllerDomDeps): ControllerDomParts {
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
    doc
  } = deps;

  function createPart(tagName: 'div' | 'span', className: string, attribute: string): HTMLElement {
    const element = applyNoTranslate(doc.createElement(tagName));
    element.className = className;
    element.setAttribute(attribute, '');
    return element;
  }

  // The parts a rendered footer already has; null when any is missing.
  function readFooterParts(footer: HTMLElement): FooterParts | null {
    const read = (name: string): HTMLElement | null => findPart(footer, `data-search-input-mode-menu-footer-${name}`);
    const filterText = read('filter-text');
    const actions = read('actions');
    const navigationHint = read('navigation-hint');
    const navigationKey = read('navigation-key');
    const navigationText = read('navigation-text');
    const selectHint = read('select-hint');
    const selectKey = read('select-key');
    const selectText = read('select-text');
    const inputHint = read('input-hint');
    const inputKey = read('input-key');
    const inputText = read('input-text');
    const shortcutHint = read('shortcut-hint');
    const shortcutKey = read('key');
    const shortcutText = read('text');
    if (!filterText || !actions || !navigationHint || !navigationKey || !navigationText ||
        !selectHint || !selectKey || !selectText || !inputHint || !inputKey || !inputText ||
        !shortcutHint || !shortcutKey || !shortcutText) {
      return null;
    }
    return {
      filterText, actions, navigationHint, navigationKey, navigationText, selectHint, selectKey, selectText,
      inputHint, inputKey, inputText, shortcutHint, shortcutKey, shortcutText
    };
  }

  function createFooterParts(): FooterParts {
    const footerClass = 'x-lumno-search-input-mode__menu-footer';
    const attribute = (name: string): string => `data-search-input-mode-menu-footer-${name}`;
    const hint = (name: string): HTMLElement => createPart(
      'span',
      `${footerClass}-hint ${footerClass}-hint--${name}`,
      attribute(`${name}-hint`)
    );
    return {
      filterText: createPart('span', `${footerClass}-filter-text`, attribute('filter-text')),
      actions: createPart('span', `${footerClass}-actions`, attribute('actions')),
      navigationHint: hint('navigation'),
      navigationKey: createPart('span', `${footerClass}-key ${footerClass}-key--arrows`, attribute('navigation-key')),
      navigationText: createPart('span', `${footerClass}-text`, attribute('navigation-text')),
      selectHint: hint('select'),
      selectKey: createPart('span', `${footerClass}-key`, attribute('select-key')),
      selectText: createPart('span', `${footerClass}-text`, attribute('select-text')),
      inputHint: hint('input'),
      inputKey: createPart('span', `${footerClass}-key`, attribute('input-key')),
      inputText: createPart('span', `${footerClass}-text`, attribute('input-text')),
      shortcutHint: hint('shortcut'),
      shortcutKey: createPart('span', `${footerClass}-key`, attribute('key')),
      shortcutText: createPart('span', `${footerClass}-text`, attribute('text'))
    };
  }

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
  ], useImportantStyles);
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
  ], useImportantStyles);
  setStyle(siteSearchPrefix, 'justify-content', 'flex-start', useImportantStyles);
  setStyle(siteSearchPrefix, 'height', '32px', useImportantStyles);
  setStyle(siteSearchPrefix, 'padding', '0 6px', useImportantStyles);
  modeMenu.id = `${prefixId}-menu`;
  modeMenu.className = `x-lumno-search-input-mode__menu ${menuSurfaceClass}`;
  menuSurface.apply(modeMenu);
  modeMenu.setAttribute('data-surface', surface);
  modeMenu.setAttribute('data-filtered', 'false');
  modeMenu.setAttribute('data-search-active', 'false');
  modeMenu.setAttribute('role', 'menu');
  modeMenu.setAttribute('aria-labelledby', prefixId);
  modeMenu.tabIndex = -1;
  modeMenu.hidden = true;
  const modeMenuEdgeOffset = surface === 'newtab' ? '-6px' : '-1px';
  const modeMenuPositionTransform = 'translateY(calc(var(--x-lumno-search-mode-menu-result-offset, 0px) + var(--x-lumno-search-mode-menu-lift, 0px)))';
  const modeMenuClosedTransform = surface === 'newtab'
    ? `${modeMenuPositionTransform} scale(0.96, 0.86)`
    : 'translateY(calc(var(--x-lumno-search-mode-menu-result-offset, 0px) + var(--x-lumno-search-mode-menu-lift, 0px) - 6px)) scale(0.96, 0.86)';
  const modeMenuStyles: CssDeclaration[] = [
    ['position', 'absolute'],
    ['left', modeMenuEdgeOffset],
    ['right', modeMenuEdgeOffset],
    ['top', `calc(100% + ${vars.panelGap})`],
    ['width', 'auto'],
    ['height', 'min(360px, 62vh, var(--x-lumno-search-mode-menu-viewport-max-height, 360px))'],
    ['max-height', 'min(360px, 62vh, var(--x-lumno-search-mode-menu-viewport-max-height, 360px))'],
    ['overflow', 'hidden'],
    ['padding', '0'],
    ['border', `1px solid ${vars.panelBorder}`],
    ['border-radius', vars.panelRadius],
    ['background', vars.panelBg],
    ['box-shadow', vars.panelShadow],
    ['box-sizing', 'border-box'],
    ['font-family', INPUT_FONT_STACK],
    ['font-size', '13px'],
    ['color', vars.panelText],
    ['z-index', '40'],
    ['--x-lumno-search-mode-menu-lift', '0px'],
    ['--x-lumno-search-mode-menu-result-offset', '0px'],
    ['--x-extension-menu-surface-closed-transform', modeMenuClosedTransform],
    ['--x-extension-menu-surface-open-transform', `${modeMenuPositionTransform} scale(1, 1)`],
    ['overscroll-behavior', 'contain']
  ];
  modeMenu.style.cssText = '';
  modeMenuStyles.forEach((pair) => {
    setStyle(modeMenu, pair[0], pair[1], useImportantStyles);
  });
  if (!modeMenu.parentNode) {
    container.appendChild(modeMenu);
  }
  const foundContent = findPart(modeMenu, 'data-search-input-mode-menu-content');
  const foundFooter = findPart(modeMenu, 'data-search-input-mode-menu-footer');
  let modeMenuContent: HTMLElement;
  let modeMenuFooter: HTMLElement;
  if (foundContent && foundFooter) {
    modeMenuContent = foundContent;
    modeMenuFooter = foundFooter;
  } else {
    while (modeMenu.firstChild) {
      modeMenu.removeChild(modeMenu.firstChild);
    }
    modeMenuContent = createPart('div', 'x-lumno-search-input-mode__menu-content', 'data-search-input-mode-menu-content');
    modeMenuContent.setAttribute('role', 'presentation');
    modeMenuFooter = createPart('div', 'x-lumno-search-input-mode__menu-footer', 'data-search-input-mode-menu-footer');
    modeMenuFooter.setAttribute('role', 'presentation');
    modeMenuFooter.setAttribute('aria-hidden', 'true');
    modeMenu.appendChild(modeMenuContent);
    modeMenu.appendChild(modeMenuFooter);
  }

  let footer = readFooterParts(modeMenuFooter);
  if (!footer) {
    while (modeMenuFooter.firstChild) {
      modeMenuFooter.removeChild(modeMenuFooter.firstChild);
    }
    footer = createFooterParts();
  }
  const legacyModeMenuFooterDivider = modeMenuFooter.querySelector('.x-lumno-search-input-mode__menu-footer-divider');
  if (legacyModeMenuFooterDivider) {
    legacyModeMenuFooterDivider.remove();
  }
  modeMenuFooter.appendChild(footer.filterText);
  footer.navigationHint.appendChild(footer.navigationKey);
  footer.navigationHint.appendChild(footer.navigationText);
  footer.selectHint.appendChild(footer.selectKey);
  footer.selectHint.appendChild(footer.selectText);
  footer.inputHint.appendChild(footer.inputKey);
  footer.inputHint.appendChild(footer.inputText);
  footer.shortcutHint.appendChild(footer.shortcutKey);
  footer.shortcutHint.appendChild(footer.shortcutText);
  footer.actions.appendChild(footer.navigationHint);
  footer.actions.appendChild(footer.selectHint);
  footer.actions.appendChild(footer.inputHint);
  footer.actions.appendChild(footer.shortcutHint);
  modeMenuFooter.appendChild(footer.actions);
  return {
    modeMenuContent,
    modeMenuFooter,
    modeMenuFooterFilterText: footer.filterText,
    modeMenuFooterNavigationKey: footer.navigationKey,
    modeMenuFooterNavigationText: footer.navigationText,
    modeMenuFooterSelectKey: footer.selectKey,
    modeMenuFooterSelectText: footer.selectText,
    modeMenuFooterInputKey: footer.inputKey,
    modeMenuFooterInputText: footer.inputText,
    modeMenuFooterKey: footer.shortcutKey,
    modeMenuFooterText: footer.shortcutText
  };
}

export { createControllerDom };
export type { ControllerDomDeps, ControllerDomParts };
