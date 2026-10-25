import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  PopconfirmContent,
  type PopconfirmClassNames,
  type PopconfirmCopy
} from './popconfirm-content';
import { queryHtmlElement, queryHtmlTag, querySvgElement } from '../dom-lookup';
import { createRenderStore, type RenderStore } from './render-store';
import { innerHtml } from './inner-html';
import { ModeMenu, createModeMenuStore, type ModeMenuStore, type ModeMenuView } from './search/mode-menu';
import {
  ModeTag,
  TabHint,
  createModeTagStore,
  createTabHintStore,
  type ModeTagView,
  type ModeTagStore,
  type TabHintStore,
  type TabHintView
} from './search/mode-tag';

type StyleOverrides = Record<string, string>;

export interface SearchInputActionConfirm {
  // Read on every open, so the copy follows the current UI language.
  getCopy(): PopconfirmCopy;
  onConfirm(event: MouseEvent): void;
}

type SecondaryActionConfig = NonNullable<SearchInputConfig['secondaryAction']>;

// The search icon at the field's start as a button that opens the scope
// panel.
export interface SearchScopeAction {
  enabled: boolean;
  label: string;
  onActivate(): void;
}

// The surface's tooltip that follows the pointer over the field's buttons.
export interface SearchInputTooltip {
  bind(button: HTMLElement, getText: () => string): void;
  hide(): void;
}

// What the surface changes about the field's chrome after creating it.
export interface SearchInputChrome {
  // The buttons' names and tooltips, in the current language.
  rightIconLabel: string;
  clearLabel: string;
  secondaryLabel: string;
  scopeAction: SearchScopeAction | null;
  // The underline, when the surface decides it (the overlay shows it with
  // its results); null leaves it to the field's text.
  underline: boolean | null;
  tooltip: SearchInputTooltip | null;
}

// Binds the surface's tooltip to the button, reading its label as it is
// when the tooltip shows.
function useButtonTooltip<T extends HTMLElement>(tooltip: SearchInputTooltip | null, label: string) {
  const ref = useRef<T>(null);
  const latestLabel = useRef(label);
  latestLabel.current = label;
  useLayoutEffect(() => {
    if (tooltip && ref.current) {
      tooltip.bind(ref.current, () => latestLabel.current);
    }
  }, [tooltip]);
  return ref;
}

export interface SearchInputConfig {
  // An empty element the surface's own view drew for the input; a new one
  // otherwise.
  container?: HTMLDivElement;
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
  modeTagView: ModeTagView;
  tabHintView: TabHintView;
  modePrefix: HTMLButtonElement;
  modePrefixChevron: HTMLElement;
  modePrefixCurrent: HTMLSpanElement;
  modePrefixGlyph: HTMLElement;
  modePrefixIconFrame: HTMLSpanElement;
  modePrefixIcon: HTMLImageElement;
  modePrefixLineIcon: SVGElement;
  modePrefixText: HTMLSpanElement;
  modeTabHint: HTMLSpanElement;
  modeTabHintKey: HTMLSpanElement;
  modeTabHintText: HTMLSpanElement;
  rightIcon: HTMLButtonElement;
  secondaryAction: HTMLButtonElement | null;
  setChrome(patch: Partial<SearchInputChrome>): void;
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

function SecondaryAction({ action, label, tooltip }: {
  action: SecondaryActionConfig;
  label: string;
  tooltip: SearchInputTooltip | null;
}) {
  const confirm = action.confirm;
  const hover = useHoverActive();
  const [open, setOpen] = useState(false);
  // Kept after closing so the bubble fades out with its content.
  const [copy, setCopy] = useState<PopconfirmCopy | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useButtonTooltip<HTMLButtonElement>(tooltip, label);
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
  }, [open, triggerRef]);

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
    if (tooltip) {
      tooltip.hide();
    }
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
        {...hover.handlers}
        aria-label={label}
        className={action.className || ''}
        dangerouslySetInnerHTML={innerHtml(action.html || '')}
        data-hover-active={hover.active ? 'true' : undefined}
        data-tooltip={label || undefined}
        id={action.id}
        onClick={confirm ? toggle : (tooltip ? tooltip.hide : undefined)}
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

// The stores the input mode controller draws the mode tag, Tab hint and
// scope panel through, and the field's text as the chrome around it last
// saw it.
interface InputStores {
  modeMenu: ModeMenuStore;
  modeTag: ModeTagStore;
  tabHint: TabHintStore;
  value: RenderStore<string>;
  chrome: RenderStore<SearchInputChrome>;
}

// Shows the hover look while the pointer is over the button; a press,
// leaving or losing focus ends it.
function useHoverActive() {
  const [active, setActive] = useState(false);
  const end = () => setActive(false);
  return {
    active,
    handlers: {
      onMouseEnter: () => setActive(true),
      onMouseLeave: end,
      onBlur: end,
      onPointerUp: end,
      onPointerCancel: end
    }
  };
}

function RightIcon({ config, label, tooltip }: {
  config: SearchInputConfig;
  label: string;
  tooltip: SearchInputTooltip | null;
}) {
  const hover = useHoverActive();
  const ref = useButtonTooltip<HTMLButtonElement>(tooltip, label);
  return (
    <button
      {...noTranslateProps()}
      {...hover.handlers}
      aria-label={label}
      className={CLASSES.rightIcon}
      dangerouslySetInnerHTML={innerHtml(
        config.rightIconHtml ||
          '<i class="_x_extension_svg_2024_unique_ ri-icon ri-size-16 ri-settings-line" aria-hidden="true"></i>'
      )}
      data-hover-active={hover.active ? 'true' : 'false'}
      data-tooltip={label}
      id={config.rightIconId || '_x_extension_search_right_icon_2024_unique_'}
      onClick={(event) => {
        hover.handlers.onMouseLeave();
        if (tooltip) {
          tooltip.hide();
        }
        event.currentTarget.blur();
      }}
      ref={ref}
      type="button"
    />
  );
}

// Shown only while the field has text; clearing keeps focus, and the
// caret, in the field.
function ClearAction({ action, label, visible, inputRef, tooltip }: {
  action: NonNullable<SearchInputConfig['clearAction']>;
  label: string;
  visible: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  tooltip: SearchInputTooltip | null;
}) {
  const hover = useHoverActive();
  const ref = useButtonTooltip<HTMLButtonElement>(tooltip, label);
  return (
    <button
      {...noTranslateProps()}
      {...hover.handlers}
      aria-label={label}
      className={CLASSES.clearAction}
      dangerouslySetInnerHTML={innerHtml(action.html || '<i class="ri-icon ri-size-16 ri-close-line" aria-hidden="true"></i>')}
      data-hover-active={hover.active && visible ? 'true' : undefined}
      data-tooltip={label}
      hidden={!visible}
      id={action.id}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (tooltip) {
          tooltip.hide();
        }
        const input = inputRef.current;
        if (!input) {
          return;
        }
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus({ preventScroll: true });
      }}
      onMouseDown={(event) => event.preventDefault()}
      ref={ref}
      type="button"
    />
  );
}

// The search icon; while the surface makes it a scope action, a button
// that opens the scope panel.
function ScopeIcon({ config, action, tooltip }: {
  config: SearchInputConfig;
  action: SearchScopeAction | null;
  tooltip: SearchInputTooltip | null;
}) {
  const [hover, setHover] = useState(false);
  const enabled = Boolean(action && action.enabled);
  // A disabled action has nothing to say.
  const iconRef = useButtonTooltip<HTMLDivElement>(action ? tooltip : null, enabled && action ? action.label : '');
  // A disabled action gives its focus up.
  useLayoutEffect(() => {
    const icon = iconRef.current;
    if (!enabled && icon) {
      const root = icon.getRootNode();
      const focused = 'activeElement' in root ? root.activeElement : null;
      if (focused === icon) {
        icon.blur();
      }
    }
  }, [enabled, iconRef]);
  const activate = (event: ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!action || !action.enabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setHover(false);
    if (tooltip) {
      tooltip.hide();
    }
    action.onActivate();
    event.currentTarget.blur();
  };
  const end = () => setHover(false);
  return (
    <div
      {...noTranslateProps()}
      aria-disabled={action ? (enabled ? 'false' : 'true') : undefined}
      aria-label={action ? action.label : undefined}
      className={CLASSES.icon}
      data-hover-active={action ? (hover && enabled ? 'true' : 'false') : undefined}
      data-search-scope-action={action ? 'true' : undefined}
      data-tooltip={enabled && action ? action.label : undefined}
      id={config.iconId || '_x_extension_search_icon_2024_unique_'}
      onBlur={action ? end : undefined}
      onClick={action ? activate : undefined}
      onFocus={action ? () => setHover(true) : undefined}
      onKeyDown={action ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          activate(event);
        }
      } : undefined}
      onMouseEnter={action ? () => setHover(true) : undefined}
      onMouseLeave={action ? end : undefined}
      onPointerCancel={action ? end : undefined}
      onPointerUp={action ? end : undefined}
      ref={iconRef}
      role={action ? 'button' : undefined}
      tabIndex={action ? (enabled ? 0 : -1) : undefined}
    >
      <i
        aria-hidden="true"
        className="_x_extension_svg_2024_unique_ ri-icon ri-size-16 ri-search-line"
      />
    </div>
  );
}

function SearchInput({ config, stores }: { config: SearchInputConfig; stores: InputStores }) {
  const value = useSyncExternalStore(stores.value.subscribe, stores.value.getSnapshot);
  const chrome = useSyncExternalStore(stores.chrome.subscribe, stores.chrome.getSnapshot);
  const inputRef = useRef<HTMLInputElement>(null);
  // An input border set by the surface replaces the underline.
  const hasBorderOverride = Boolean(
    config.inputStyleOverrides &&
      Object.prototype.hasOwnProperty.call(config.inputStyleOverrides, 'border-bottom')
  );
  const dividerVisible = !hasBorderOverride && (chrome.underline === null
    ? Boolean(config.showUnderlineWhenEmpty) || Boolean(value.trim())
    : chrome.underline);
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
      <ScopeIcon action={chrome.scopeAction} config={config} tooltip={chrome.tooltip} />
      <input
        {...noTranslateProps()}
        autoComplete="off"
        className={CLASSES.input}
        id={config.inputId || '_x_extension_search_input_2024_unique_'}
        onInput={(event) => stores.value.render(event.currentTarget.value)}
        placeholder={config.placeholder || 'Search or enter URL…'}
        ref={inputRef}
        type="text"
      />
      <ModeTag prefixId={modePrefixId} store={stores.modeTag} />
      <ModeMenu prefixId={modePrefixId} store={stores.modeMenu} surface={modeSurface} />
      <TabHint id={modeTabHintId} store={stores.tabHint} surface={modeSurface} />
      <div
        {...noTranslateProps()}
        className={CLASSES.divider}
        data-visible={dividerVisible ? 'true' : 'false'}
        id={config.dividerId || '_x_extension_input_divider_2024_unique_'}
      />
      {config.showRightIcon === false ? null : <RightIcon config={config} label={chrome.rightIconLabel} tooltip={chrome.tooltip} />}
      {config.clearAction ? (
        <ClearAction
          action={config.clearAction}
          inputRef={inputRef}
          label={chrome.clearLabel}
          tooltip={chrome.tooltip}
          visible={value !== ''}
        />
      ) : null}
      {config.secondaryAction ? (
        <SecondaryAction action={config.secondaryAction} label={chrome.secondaryLabel} tooltip={chrome.tooltip} />
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
  const container = config.container || document.createElement('div');
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
  const stores: InputStores = {
    modeMenu: createModeMenuStore(),
    modeTag: createModeTagStore(),
    tabHint: createTabHintStore(),
    value: createRenderStore(''),
    chrome: createRenderStore<SearchInputChrome>({
      rightIconLabel: config.rightIconAlt || 'Settings',
      clearLabel: config.clearAction && config.clearAction.ariaLabel ? config.clearAction.ariaLabel : 'Clear',
      secondaryLabel: config.secondaryAction && config.secondaryAction.ariaLabel ? config.secondaryAction.ariaLabel : '',
      scopeAction: null,
      underline: null,
      tooltip: null
    })
  };
  flushSync(() => root.render(<SearchInput config={config} stores={stores} />));
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
  const modePrefixLineIcon = querySvgElement(container, '[data-search-input-mode-line-icon]');
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
    !modePrefixLineIcon ||
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
  // Brings the chrome up to date after the surface set the field's text
  // itself; returns whether the clear button shows.
  const syncClearAction = () => {
    if (input.value !== stores.value.getSnapshot()) {
      stores.value.render(input.value);
    }
    return Boolean(clearAction) && input.value !== '';
  };
  const modeMenuView: ModeMenuView = {
    render: (model, handlers) => stores.modeMenu.render({ model, handlers })
  };
  const modeTagView: ModeTagView = {
    render: (model, handlers) => stores.modeTag.render({ model, handlers })
  };
  const tabHintView: TabHintView = { render: stores.tabHint.render };
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
    modeMenuView,
    modeTagView,
    tabHintView,
    modePrefix,
    modePrefixChevron,
    modePrefixCurrent,
    modePrefixGlyph,
    modePrefixIconFrame,
    modePrefixIcon,
    modePrefixLineIcon,
    modePrefixText,
    modeTabHint,
    modeTabHintKey,
    modeTabHintText,
    rightIcon,
    secondaryAction,
    setChrome(patch: Partial<SearchInputChrome>) {
      stores.chrome.render({ ...stores.chrome.getSnapshot(), ...patch });
    },
    syncClearAction
  };
  // The surface's own looks for the parts, set once.
  const overrides: Array<[HTMLElement | null, StyleOverrides | undefined]> = [
    [container, config.containerStyleOverrides],
    [input, config.inputStyleOverrides],
    [divider, config.dividerStyleOverrides],
    [icon, config.iconStyleOverrides],
    [rightIcon, config.rightIconStyleOverrides],
    [clearAction, config.clearAction ? config.clearAction.styleOverrides : undefined]
  ];
  overrides.forEach(([element, styles]) => {
    if (element && styles) {
      applyStyles(element, styles);
    }
  });
  if (config.onInput) {
    input.addEventListener('input', config.onInput);
  }
  if (config.onFocus) {
    input.addEventListener('focus', config.onFocus);
  }
  if (config.onBlur) {
    input.addEventListener('blur', config.onBlur);
  }
  if (config.onKeyDown) {
    input.addEventListener('keydown', config.onKeyDown);
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
