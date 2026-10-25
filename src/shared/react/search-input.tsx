import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  PopconfirmContent,
  type PopconfirmClassNames,
  type PopconfirmCopy
} from './popconfirm-content';
import { queryHtmlElement, queryHtmlElements, queryHtmlTag } from '../dom-lookup';
import { ModeMenu, createModeMenuStore, type ModeMenuStore, type ModeMenuView } from './search/mode-menu';

type StyleOverrides = Record<string, string>;

export interface SearchInputActionConfirm {
  // Read on every open, so the copy follows the current UI language.
  getCopy(): PopconfirmCopy;
  onConfirm(event: MouseEvent): void;
}

type SecondaryActionConfig = NonNullable<SearchInputConfig['secondaryAction']>;

export interface SearchInputConfig {
  clearAction?: {
    ariaLabel?: string;
    html?: string;
    id: string;
    styleOverrides?: StyleOverrides;
  };
  containerId?: string;
  containerStyleOverrides?: StyleOverrides;
  dividerId?: string;
  dividerStyleOverrides?: StyleOverrides;
  iconId?: string;
  iconStyleOverrides?: StyleOverrides;
  inputId?: string;
  inputStyleOverrides?: StyleOverrides;
  modeBadge?: {
    className?: string;
    id?: string;
    surface?: string;
    visible?: boolean;
  };
  onBlur?(event: FocusEvent): void;
  onFocus?(event: FocusEvent): void;
  onInput?(event: Event): void;
  onKeyDown?(event: KeyboardEvent): void;
  placeholder?: string;
  rightIconAlt?: string;
  rightIconHtml?: string;
  rightIconId?: string;
  rightIconStyleOverrides?: StyleOverrides;
  secondaryAction?: {
    ariaLabel?: string;
    className?: string;
    // Asks in a popconfirm under the button before running the action.
    confirm?: SearchInputActionConfirm;
    html?: string;
    id: string;
  };
  showRightIcon?: boolean;
  showUnderlineWhenEmpty?: boolean;
  // The shadow root the input draws in; its styles go there. Without one the
  // page's own stylesheet styles it.
  styleRoot?: Document | ShadowRoot | null;
}

export interface SearchInputParts {
  clearAction: HTMLButtonElement | null;
  container: HTMLDivElement;
  divider: HTMLDivElement;
  icon: HTMLDivElement;
  input: HTMLInputElement;
  modeBadge: HTMLDivElement | null;
  modeMenu: HTMLDivElement;
  modeMenuContent: HTMLDivElement;
  modeMenuFooter: HTMLDivElement;
  modeMenuView: ModeMenuView;
  modePrefix: HTMLButtonElement;
  modePrefixChevron: HTMLElement;
  modePrefixCurrent: HTMLSpanElement;
  modePrefixGlyph: HTMLElement;
  modePrefixIconFrame: HTMLSpanElement;
  modePrefixIcon: HTMLImageElement;
  modePrefixText: HTMLSpanElement;
  modeTabHint: HTMLSpanElement;
  modeTabHintKey: HTMLSpanElement;
  modeTabHintText: HTMLSpanElement;
  rightIcon: HTMLButtonElement;
  secondaryAction: HTMLButtonElement | null;
  syncClearAction(): boolean;
}

const CLASSES = Object.freeze({
  clearAction:
    'x-lumno-search-input__clear _x_extension_input_clear_class_2026_ notranslate',
  container:
    'x-lumno-search-input x-lumno-search-input__container _x_extension_input_container_class_2026_ notranslate',
  divider:
    'x-lumno-search-input__divider _x_extension_input_divider_class_2026_ notranslate',
  icon:
    'x-lumno-search-input__icon _x_extension_input_icon_class_2026_ notranslate',
  input:
    'x-lumno-search-input__field _x_extension_input_class_2026_ notranslate',
  rightIcon:
    'x-lumno-search-input__right-icon _x_extension_input_right_icon_class_2026_ notranslate'
});
const roots = new WeakMap<HTMLElement, Root>();

function noTranslateProps() {
  return {
    'data-no-translate': 'true',
    lang: 'zxx',
    notranslate: '',
    translate: 'no' as const
  };
}

const POPCONFIRM_CLASS_NAMES: PopconfirmClassNames = Object.freeze({
  actions: 'x-lumno-search-input__popconfirm-actions',
  // No Cancel button: the action button, Escape or a click outside closes it.
  cancel: '',
  confirm:
    'x-lumno-search-input__popconfirm-button x-lumno-search-input__popconfirm-button--primary',
  text: 'x-lumno-search-input__popconfirm-text'
});
const POPCONFIRM_GAP = 6;

function SecondaryAction({ action }: { action: SecondaryActionConfig }) {
  const confirm = action.confirm;
  const [open, setOpen] = useState(false);
  // Kept after closing so the bubble fades out with its content.
  const [copy, setCopy] = useState<PopconfirmCopy | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popconfirmRef = useRef<HTMLDivElement>(null);
  const popconfirmId = useId();

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  };

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger) {
      return undefined;
    }
    // The Overlay lives in a closed ShadowRoot, whose nodes are hidden from
    // document listeners, so watch the root the button is rendered in.
    const root = trigger.getRootNode();
    const onPointerDown = (event: Event) => {
      const path = event.composedPath();
      if (
        path.includes(trigger) ||
        (popconfirmRef.current && path.includes(popconfirmRef.current))
      ) {
        return;
      }
      setOpen(false);
    };
    root.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!open || event.key !== 'Escape') {
      return;
    }
    // Close only the bubble, not the surface around the search input.
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };

  const toggle = () => {
    const trigger = triggerRef.current;
    if (!confirm || !trigger) {
      return;
    }
    if (open) {
      setOpen(false);
      return;
    }
    const parent = trigger.offsetParent;
    setPosition({
      right: parent
        ? parent.clientWidth - trigger.offsetLeft - trigger.offsetWidth
        : 0,
      top: trigger.offsetTop + trigger.offsetHeight + POPCONFIRM_GAP
    });
    setCopy(confirm.getCopy());
    setOpen(true);
  };

  return (
    <>
      <button
        {...noTranslateProps()}
        aria-controls={confirm ? popconfirmId : undefined}
        aria-expanded={confirm ? open : undefined}
        aria-haspopup={confirm ? 'dialog' : undefined}
        aria-label={action.ariaLabel || ''}
        className={action.className || ''}
        dangerouslySetInnerHTML={{
          __html: action.html || ''
        }}
        id={action.id}
        onClick={confirm ? toggle : undefined}
        onKeyDown={confirm ? onKeyDown : undefined}
        ref={triggerRef}
        type="button"
      />
      {confirm ? (
        <div
          {...noTranslateProps()}
          aria-hidden={!open}
          aria-label={copy?.message}
          className="x-lumno-search-input__popconfirm"
          data-open={open ? 'true' : 'false'}
          id={popconfirmId}
          onKeyDown={onKeyDown}
          ref={popconfirmRef}
          role="dialog"
          style={position}
        >
          {copy ? (
            <PopconfirmContent
              classNames={POPCONFIRM_CLASS_NAMES}
              copy={copy}
              onConfirm={(event) => {
                close(false);
                confirm.onConfirm(event.nativeEvent);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function SearchInput({ config, modeMenuStore }: { config: SearchInputConfig; modeMenuStore: ModeMenuStore }) {
  const modeSurface =
    config.modeBadge?.surface === 'overlay' ? 'overlay' : 'newtab';
  const modePrefixId =
    modeSurface === 'overlay'
      ? '_x_extension_site_search_prefix_2024_unique_'
      : '_x_extension_newtab_site_search_prefix_2024_unique_';
  const modeTabHintId =
    modeSurface === 'overlay'
      ? '_x_extension_site_search_tab_hint_2026_unique_'
      : '_x_extension_newtab_site_search_tab_hint_2026_unique_';
  return (
    <>
      <div
        {...noTranslateProps()}
        className={CLASSES.icon}
        id={config.iconId || '_x_extension_search_icon_2024_unique_'}
      >
        <i
          aria-hidden="true"
          className="_x_extension_svg_2024_unique_ ri-icon ri-size-16 ri-search-line"
        />
      </div>
      <input
        {...noTranslateProps()}
        autoComplete="off"
        className={CLASSES.input}
        id={config.inputId || '_x_extension_search_input_2024_unique_'}
        placeholder={config.placeholder || 'Search or enter URL…'}
        type="text"
      />
      <button
        {...noTranslateProps()}
        className="x-lumno-search-input-mode__prefix"
        data-search-input-mode-prefix=""
        id={modePrefixId}
        type="button"
      >
        <span
          className="x-lumno-search-input-mode__prefix-icon-frame"
          data-search-input-mode-prefix-icon-frame=""
          style={{ display: 'none' }}
        >
          <img
            alt=""
            data-search-input-mode-prefix-icon=""
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </span>
        <i
          aria-hidden="true"
          className="ri-icon ri-size-16 ri-search-line"
          data-search-input-mode-prefix-glyph=""
        />
        <span
          {...noTranslateProps()}
          data-search-input-mode-prefix-text=""
        />
        <span
          {...noTranslateProps()}
          aria-hidden="true"
          data-search-input-mode-current=""
        />
        <i
          aria-hidden="true"
          className="ri-icon ri-size-16 ri-arrow-down-s-line"
          data-search-input-mode-prefix-chevron=""
        />
      </button>
      <ModeMenu prefixId={modePrefixId} store={modeMenuStore} surface={modeSurface} />
      <span
        {...noTranslateProps()}
        aria-hidden="true"
        className="x-lumno-search-input-mode__tab-hint"
        data-search-input-mode-tab-hint=""
        id={modeTabHintId}
      >
        <span
          {...noTranslateProps()}
          data-search-input-mode-tab-key=""
        />
        <span
          {...noTranslateProps()}
          data-search-input-mode-tab-text=""
        />
      </span>
      <div
        {...noTranslateProps()}
        className={CLASSES.divider}
        id={config.dividerId || '_x_extension_input_divider_2024_unique_'}
      />
      {config.showRightIcon === false ? null : (
        <button
          {...noTranslateProps()}
          aria-label={config.rightIconAlt || 'Settings'}
          className={CLASSES.rightIcon}
          dangerouslySetInnerHTML={{
            __html:
              config.rightIconHtml ||
              '<i class="_x_extension_svg_2024_unique_ ri-icon ri-size-16 ri-settings-line" aria-hidden="true"></i>'
          }}
          id={
            config.rightIconId ||
            '_x_extension_search_right_icon_2024_unique_'
          }
          type="button"
        />
      )}
      {config.clearAction ? (
        <button
          {...noTranslateProps()}
          aria-label={config.clearAction.ariaLabel || 'Clear'}
          className={CLASSES.clearAction}
          dangerouslySetInnerHTML={{
            __html:
              config.clearAction.html ||
              '<i class="ri-icon ri-size-16 ri-close-line" aria-hidden="true"></i>'
          }}
          hidden
          id={config.clearAction.id}
          type="button"
        />
      ) : null}
      {config.secondaryAction ? (
        <SecondaryAction action={config.secondaryAction} />
      ) : null}
      {config.modeBadge ? (
        <div
          className={
            config.modeBadge.className || 'x-lumno-search-input-mode__badge'
          }
          data-surface={config.modeBadge.surface || 'shared'}
          data-visible={config.modeBadge.visible ? 'true' : 'false'}
          id={config.modeBadge.id}
        />
      ) : null}
    </>
  );
}

function getRuntimeUrl(path: string): string {
  if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.getURL !== 'function') {
    return '';
  }
  return chrome.runtime.getURL(path) || '';
}

function ensureLink(
  root: Document | ShadowRoot | HTMLElement,
  id: string,
  resourcePath: string
) {
  if (root.querySelector(`#${id}`)) {
    return;
  }
  const href = getRuntimeUrl(resourcePath);
  if (!href) {
    return;
  }
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  root.appendChild(link);
}

function ensureStyles(config: SearchInputConfig) {
  const isolated = Boolean(config.styleRoot);
  const root =
    config.styleRoot ||
    document.head ||
    document.documentElement;
  if (!root) {
    return;
  }
  ensureLink(
    root,
    isolated
      ? '_x_extension_open_sans_shadow_css_2026_unique_'
      : '_x_extension_open_sans_css_2024_unique_',
    'assets/fonts/open-sans/open-sans.css'
  );
  ensureLink(
    root,
    isolated
      ? '_x_extension_remixicon_shadow_css_2026_unique_'
      : '_x_extension_remixicon_css_2024_unique_',
    'assets/remixicon/fonts/remixicon.css'
  );
  ensureLink(
    root,
    '_x_extension_input_component_style_2026_unique_',
    'src/shared/search/search-input.css'
  );
}

function applyStyles(
  element: HTMLElement,
  styles: StyleOverrides
) {
  Object.entries(styles).forEach(([property, value]) => {
    element.style.setProperty(property, value);
  });
}

export function createSearchInput(
  config: SearchInputConfig = {}
): SearchInputParts {
  ensureStyles(config);
  const isolated = Boolean(config.styleRoot);
  const container = document.createElement('div');
  container.id =
    config.containerId || '_x_extension_input_container_2024_unique_';
  container.className = CLASSES.container;
  container.dataset.noTranslate = 'true';
  container.dataset.reactIsland = 'shared-search-input';
  container.lang = 'zxx';
  container.setAttribute('notranslate', '');
  container.setAttribute('translate', 'no');
  const root = createRoot(container);
  roots.set(container, root);
  const modeMenuStore = createModeMenuStore();
  flushSync(() => root.render(<SearchInput config={config} modeMenuStore={modeMenuStore} />));
  const input = queryHtmlTag(container, 'input', 'input');
  const icon = queryHtmlTag(container, '.x-lumno-search-input__icon', 'div');
  const divider = queryHtmlTag(container, '.x-lumno-search-input__divider', 'div');
  let rightIcon = queryHtmlTag(container, '.x-lumno-search-input__right-icon', 'button');
  if (!rightIcon) {
    rightIcon = document.createElement('button');
  }
  if (!input || !icon || !divider) {
    root.unmount();
    throw new Error('Search input mount');
  }
  const modeBadge = config.modeBadge
    ? queryHtmlTag(container, `#${config.modeBadge.id}`, 'div')
    : queryHtmlTag(container, '.x-lumno-search-input-mode__badge', 'div');
  const secondaryAction = config.secondaryAction
    ? queryHtmlTag(container, `#${config.secondaryAction.id}`, 'button')
    : null;
  const clearAction = config.clearAction
    ? queryHtmlTag(container, `#${config.clearAction.id}`, 'button')
    : null;
  const modePrefix = queryHtmlTag(container, '[data-search-input-mode-prefix]', 'button');
  const modePrefixGlyph = queryHtmlElement(container, '[data-search-input-mode-prefix-glyph]');
  const modePrefixIcon = queryHtmlTag(container, '[data-search-input-mode-prefix-icon]', 'img');
  const modePrefixIconFrame = queryHtmlTag(container, '[data-search-input-mode-prefix-icon-frame]', 'span');
  const modePrefixText = queryHtmlTag(container, '[data-search-input-mode-prefix-text]', 'span');
  const modeTabHint = queryHtmlTag(container, '[data-search-input-mode-tab-hint]', 'span');
  const modeTabHintKey = queryHtmlTag(container, '[data-search-input-mode-tab-key]', 'span');
  const modeTabHintText = queryHtmlTag(container, '[data-search-input-mode-tab-text]', 'span');
  const modePrefixChevron = queryHtmlElement(container, '[data-search-input-mode-prefix-chevron]');
  const modePrefixCurrent = queryHtmlTag(container, '[data-search-input-mode-current]', 'span');
  const modeMenu = queryHtmlTag(container, '[data-search-input-mode-menu]', 'div');
  const modeMenuContent = queryHtmlTag(container, '[data-search-input-mode-menu-content]', 'div');
  const modeMenuFooter = queryHtmlTag(container, '[data-search-input-mode-menu-footer]', 'div');
  if (
    !modePrefix ||
    !modePrefixGlyph ||
    !modePrefixIconFrame ||
    !modePrefixIcon ||
    !modePrefixText ||
    !modePrefixChevron ||
    !modePrefixCurrent ||
    !modeMenu ||
    !modeMenuContent ||
    !modeMenuFooter ||
    !modeTabHint ||
    !modeTabHintKey ||
    !modeTabHintText
  ) {
    root.unmount();
    throw new Error('Search mode mount');
  }
  // Shown only while the field has text; programmatic value changes are picked up by the caller.
  const syncClearAction = () => {
    if (!clearAction) {
      return false;
    }
    const visible = input.value !== '';
    if (clearAction.hidden === visible) {
      clearAction.hidden = !visible;
      if (!visible) {
        clearAction.removeAttribute('data-hover-active');
      }
    }
    return visible;
  };
  const parts = {
    clearAction,
    container,
    divider,
    icon,
    input,
    modeBadge,
    modeMenu,
    modeMenuContent,
    modeMenuFooter,
    modeMenuView: { render: modeMenuStore.render },
    modePrefix,
    modePrefixChevron,
    modePrefixCurrent,
    modePrefixGlyph,
    modePrefixIconFrame,
    modePrefixIcon,
    modePrefixText,
    modeTabHint,
    modeTabHintKey,
    modeTabHintText,
    rightIcon,
    secondaryAction,
    syncClearAction
  };
  (
    [
      [container, 'container', config.containerStyleOverrides],
      [input, 'input', config.inputStyleOverrides],
      [divider, 'divider', config.dividerStyleOverrides],
      [icon, 'icon', config.iconStyleOverrides],
      [rightIcon, 'rightIcon', config.rightIconStyleOverrides]
    ] as const
  ).forEach(([element, key, overrides]) => {
    if (overrides) {
      applyStyles(element, overrides);
    }
  });
  const hasBorderOverride = Boolean(
    config.inputStyleOverrides &&
      Object.prototype.hasOwnProperty.call(
        config.inputStyleOverrides,
        'border-bottom'
      )
  );
  const setDividerVisible = (visible: boolean) => {
    if (isolated) {
      divider.dataset.visible = visible ? 'true' : 'false';
    } else {
      divider.style.setProperty(
        'display',
        visible ? 'block' : 'none'
      );
    }
  };
  const updateDivider = () => {
    if (hasBorderOverride) {
      setDividerVisible(false);
    } else if (config.showUnderlineWhenEmpty) {
      setDividerVisible(true);
    } else {
      setDividerVisible(Boolean(input.value.trim()));
    }
  };
  updateDivider();
  if (config.onInput) {
    input.addEventListener('input', config.onInput);
  }
  input.addEventListener('input', updateDivider);
  if (config.onFocus) {
    input.addEventListener('focus', config.onFocus);
  }
  if (config.onBlur) {
    input.addEventListener('blur', config.onBlur);
  }
  if (config.onKeyDown) {
    input.addEventListener('keydown', config.onKeyDown);
  }
  const setRightIconVisualState = (active: boolean) => {
    rightIcon.dataset.hoverActive = active ? 'true' : 'false';
    if (isolated) {
      return;
    }
    applyStyles(
      rightIcon,
      {
        background: active
          ? 'var(--x-ext-input-icon-hover-bg, rgba(148, 163, 184, 0.16))'
          : 'transparent',
        color: active
          ? 'var(--x-ext-input-icon-hover, #4B5563)'
          : 'var(--x-ext-input-icon, #9CA3AF)',
        transform: 'none'
      }
    );
  };
  setRightIconVisualState(false);
  queryHtmlElements(rightIcon, '*')
    .forEach((node) => {
      if (!isolated) {
        applyStyles(
          node,
          { cursor: 'inherit', 'pointer-events': 'none' }
        );
      }
    });
  rightIcon.addEventListener('mouseenter', () =>
    setRightIconVisualState(true)
  );
  ['mouseleave', 'blur', 'pointerup', 'pointercancel'].forEach((type) => {
    rightIcon.addEventListener(type, () => setRightIconVisualState(false));
  });
  rightIcon.addEventListener('click', () => {
    setRightIconVisualState(false);
    rightIcon.blur();
  });
  if (clearAction) {
    if (config.clearAction?.styleOverrides) {
      applyStyles(clearAction, config.clearAction.styleOverrides);
    }
    const resetClearVisualState = () => {
      clearAction.removeAttribute('data-hover-active');
    };
    clearAction.addEventListener('mouseenter', () => {
      clearAction.setAttribute('data-hover-active', 'true');
    });
    ['mouseleave', 'blur', 'pointerup', 'pointercancel'].forEach((type) => {
      clearAction.addEventListener(type, resetClearVisualState);
    });
    // Keep focus (and the caret) in the field while clearing.
    clearAction.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    clearAction.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus({ preventScroll: true });
    });
    input.addEventListener('input', syncClearAction);
    syncClearAction();
  }
  return parts;
}

export function destroySearchInput(
  target: SearchInputParts | HTMLElement | null
) {
  const container =
    target && 'container' in target ? target.container : target;
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const root = roots.get(container);
  if (!root) {
    return;
  }
  flushSync(() => root.unmount());
  roots.delete(container);
}

export function createSearchInputApi() {
  return Object.freeze({
    implementation: 'react',
    createSearchInput,
    destroySearchInput
  });
}
