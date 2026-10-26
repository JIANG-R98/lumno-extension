// Shared custom select: New Tab menus and Options settings render the same
// trigger, listbox/menu semantics, keyboard model and viewport placement.
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { isNode } from '../dom-guards';
import { queryHtmlElement } from '../dom-lookup';
import { RemixIcon } from './remix-icon';
import type { RemixIconName } from '../ui/remix-icon';

export interface SelectMenuOption {
  action?: string;
  /** Short tag after the label in the menu (for example "Beta"); not shown on the trigger. */
  badge?: string;
  /** Toggles `checked` through `onCheckedChange` and keeps the menu open, for picking several values. */
  checkbox?: boolean;
  checked?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
  /** Renders the label in this family, so a font picker previews each face. */
  fontFamily?: string;
  groupTitle?: string;
  iconName?: RemixIconName;
  /** Image icon (for example a site tile); takes precedence over `iconName`. */
  iconUrl?: string;
  label: string;
  radio?: boolean;
  /** Icon after a radio choice's label (for example an eyedropper); checked or not. */
  trailingIconName?: RemixIconName;
  value: string;
}

function filterOptions(
  options: SelectMenuOption[],
  query: string
): SelectMenuOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return options;
  }
  return options.filter((option) =>
    option.label.toLowerCase().includes(needle) ||
    option.value.toLowerCase().includes(needle)
  );
}

// Quoted so families such as "3270 Nerd Font" parse; a face the device lacks
// falls back to the menu's own stack rather than the browser default.
function getFontPreviewFamily(family: string): string {
  return `"${family.replace(/["\\]/g, '\\$&')}", var(--lumno-font-sans, sans-serif)`;
}

// Below this, a searchable menu would show too few rows under the trigger, so
// it is held against the bottom of the viewport instead. Its box never grows
// past the cap, however many fonts are installed.
const SEARCHABLE_MENU_MIN_HEIGHT = 280;
const SEARCHABLE_MENU_MAX_HEIGHT = 480;
// One empty list for a menu without options, so effects that depend on the
// options do not see a new list on each render.
const NO_OPTIONS: SelectMenuOption[] = [];

function findNextEnabledOptionIndex(
  options: SelectMenuOption[],
  currentIndex: number,
  delta: number
): number {
  if (!options.length) {
    return currentIndex;
  }
  const startIndex = currentIndex < 0
    ? (delta > 0 ? -1 : 0)
    : currentIndex;
  for (let step = 1; step <= options.length; step += 1) {
    const nextIndex = (
      startIndex + (delta * step) + options.length
    ) % options.length;
    if (!options[nextIndex]?.disabled) {
      return nextIndex;
    }
  }
  return currentIndex;
}

export interface SelectMenuConfig {
  ariaLabel?: string;
  /**
   * Id of a visible label. The trigger is then named by that label plus the
   * current value, instead of `ariaLabel`. Requires `id`.
   */
  ariaLabelledBy?: string;
  disabled?: boolean;
  /** Shown in place of the options when a search filters out every one. */
  emptyLabel?: string;
  className?: string;
  iconOnly?: boolean;
  id?: string;
  menuAlign?: 'left' | 'middle' | 'right';
  menuClassName?: string;
  menuMaxWidth?: number | string;
  menuMinWidth?: number | string;
  menuPortal?: boolean;
  menuPortalContainer?: HTMLElement;
  menuPortalOffset?: number;
  menuPortalZIndex?: number;
  menuTitle?: string;
  menuWidth?: 'auto' | 'content' | 'trigger';
  onAction?(payload: { action: string; option: SelectMenuOption }): void;
  onCheckedChange?(value: string, checked: boolean): void;
  onValueChange?(value: string): boolean | void;
  options?: SelectMenuOption[];
  /**
   * Long option lists (installed fonts) get a filter field at the top of the
   * menu. Keyboard navigation then applies to the filtered options.
   */
  searchable?: boolean;
  /** The page's own text field class, so the filter looks like its other inputs. */
  searchInputClassName?: string;
  searchPlaceholder?: string;
  selectId?: string;
  tooltip?: string;
  triggerIconName?: RemixIconName;
  /** Trigger text in place of the chosen option's label, for menus of checkbox options. */
  triggerLabel?: string;
  value?: string;
}

export interface SelectMenuControls {
  isOpen(): boolean;
  setOpen(open: boolean): void;
  syncValue(value: string): void;
}

export function toCssLength(value: number | string | undefined, fallback: string) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}px`;
  }
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function SelectMenu({
  config,
  documentObj,
  getViewportTopInset,
  host,
  onBeforeOpen,
  registerControls,
  windowObj
}: {
  config: SelectMenuConfig;
  documentObj: Document;
  getViewportTopInset?(wrapper: HTMLElement): number;
  host: HTMLElement;
  onBeforeOpen?(): void;
  registerControls?(controls: SelectMenuControls): void;
  windowObj: Window & typeof globalThis;
}) {
  const options = Array.isArray(config.options) ? config.options : NO_OPTIONS;
  const searchable = config.searchable === true;
  const [open, setOpenState] = useState(false);
  const [selectedValue, setSelectedValue] = useState(String(config.value ?? ''));
  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(false);
  // A searchable menu measures its whole list once per open; filtering then
  // changes only what it shows, never its box.
  const searchableNaturalHeightRef = useRef<number | null>(null);
  const visibleOptions = searchable ? filterOptions(options, filter) : options;
  // The open effect reads the list through this ref: it runs when the menu
  // opens or its options change, not on every keystroke in the filter.
  const visibleOptionsRef = useRef(visibleOptions);
  useLayoutEffect(() => {
    visibleOptionsRef.current = visibleOptions;
  });

  useEffect(() => {
    setSelectedValue(String(config.value ?? ''));
  }, [config.value]);

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && config.disabled) return;
      if (nextOpen && !openRef.current) {
        onBeforeOpen?.();
      }
      setOpenState(nextOpen);
    },
    [config.disabled, onBeforeOpen]
  );

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!openRef.current || !trigger || !menu) {
      return;
    }
    const triggerRect = trigger.getBoundingClientRect();
    // Modal portals use their positioned container, which may be offset or scaled.
    menu.style.position = config.menuPortalContainer || config.menuPortal === false ? 'absolute' : 'fixed';
    const parent = menu.offsetParent instanceof HTMLElement ? menu.offsetParent : null;
    const parentRect = parent?.getBoundingClientRect();
    const scaleX = parent && parentRect && parent.offsetWidth ? parentRect.width / parent.offsetWidth : 1;
    const scaleY = parent && parentRect && parent.offsetHeight ? parentRect.height / parent.offsetHeight : 1;
    const originX = parent && parentRect ? parentRect.left + (parent.clientLeft - parent.scrollLeft) * scaleX : 0;
    const originY = parent && parentRect ? parentRect.top + (parent.clientTop - parent.scrollTop) * scaleY : 0;
    if (config.menuWidth === 'trigger') {
      menu.style.width = `${triggerRect.width / scaleX}px`;
    }
    const viewportWidth = Math.max(
      0,
      windowObj.innerWidth || documentObj.documentElement.clientWidth || 0
    );
    const viewportHeight = Math.max(
      0,
      windowObj.innerHeight || documentObj.documentElement.clientHeight || 0
    );
    const padding = 8;
    const configuredInset = Number(getViewportTopInset?.(host));
    const topInset = Number.isFinite(configuredInset)
      ? Math.max(padding, configuredInset)
      : padding;
    const offset = Number.isFinite(Number(config.menuPortalOffset))
      ? Number(config.menuPortalOffset)
      : 6;
    const menuWidth = Math.max(
      menu.offsetWidth * scaleX,
      triggerRect.width || 0,
      (Number.parseFloat(windowObj.getComputedStyle(menu).minWidth) || 0) * scaleX
    );
    if (searchable && searchableNaturalHeightRef.current === null) {
      menu.style.height = '';
      menu.style.maxHeight = '';
    }
    // Layout dimensions stay stable while the shared opening animation scales the surface.
    const naturalMenuHeight = searchable && searchableNaturalHeightRef.current !== null
      ? searchableNaturalHeightRef.current
      : Math.max((menu.scrollHeight + menu.offsetHeight - menu.clientHeight) * scaleY, 0);
    if (searchable) {
      searchableNaturalHeightRef.current = naturalMenuHeight;
    }
    const align = config.menuAlign || 'right';
    let left = triggerRect.left;
    if (align === 'right') {
      left = triggerRect.right - menuWidth;
    } else if (align === 'middle') {
      left = triggerRect.left + triggerRect.width / 2 - menuWidth / 2;
    }
    left = Math.max(
      padding,
      Math.min(left, Math.max(padding, viewportWidth - menuWidth - padding))
    );
    const visualOffset = offset * scaleY;
    if (searchable) {
      // Typing shrinks the list, so a menu anchored by its bottom edge (or one
      // that flips once the rest fits below) would jump under the caret. The
      // box is fixed instead: below the trigger when there is room, otherwise
      // held against the bottom of the viewport. Its height never follows the
      // filtered rows.
      const below = triggerRect.bottom + visualOffset;
      const roomBelow = Math.max(0, viewportHeight - padding - below);
      const fullHeight = Math.min(
        naturalMenuHeight,
        SEARCHABLE_MENU_MAX_HEIGHT * scaleY,
        Math.max(0, viewportHeight - padding - topInset)
      );
      const fitsBelow = roomBelow >= Math.min(fullHeight, SEARCHABLE_MENU_MIN_HEIGHT);
      const boxHeight = fitsBelow ? Math.min(fullHeight, roomBelow) : fullHeight;
      const boxTop = fitsBelow ? below : Math.max(topInset, viewportHeight - padding - boxHeight);
      menu.style.height = `${boxHeight / scaleY}px`;
      menu.style.maxHeight = `${boxHeight / scaleY}px`;
      // Only the listbox under the field scrolls; the surface itself never does.
      menu.style.overflowY = 'hidden';
      menu.style.overflowX = 'hidden';
      menu.style.transformOrigin = `${boxTop >= below ? 'top' : 'bottom'} ${align === 'middle' ? 'center' : align}`;
      menu.style.left = `${(left - originX) / scaleX}px`;
      menu.style.right = 'auto';
      menu.style.top = `${(boxTop - originY) / scaleY}px`;
      menu.style.zIndex = String(config.menuPortalZIndex || 10000);
      return;
    }
    const spaceBelow = Math.max(0, viewportHeight - padding - triggerRect.bottom - visualOffset);
    const spaceAbove = Math.max(0, triggerRect.top - visualOffset - topInset);
    const opensAbove = naturalMenuHeight > spaceBelow && spaceAbove > spaceBelow;
    const availableHeight = opensAbove ? spaceAbove : spaceBelow;
    const menuHeight = Math.min(naturalMenuHeight, availableHeight);
    menu.style.maxHeight = `${availableHeight / scaleY}px`;
    menu.style.overflowY = 'auto';
    menu.style.overflowX = 'hidden';
    menu.style.transformOrigin = `${opensAbove ? 'bottom' : 'top'} ${align === 'middle' ? 'center' : align}`;
    let top = opensAbove ? triggerRect.top - visualOffset - menuHeight : triggerRect.bottom + visualOffset;
    top = Math.max(
      topInset,
      Math.min(top, Math.max(topInset, viewportHeight - menuHeight - padding))
    );
    menu.style.left = `${(left - originX) / scaleX}px`;
    menu.style.right = 'auto';
    menu.style.top = `${(top - originY) / scaleY}px`;
    menu.style.zIndex = String(config.menuPortalZIndex || 10000);
  }, [
    config.menuAlign,
    config.menuPortal,
    config.menuPortalContainer,
    config.menuPortalOffset,
    config.menuPortalZIndex,
    config.menuWidth,
    documentObj,
    getViewportTopInset,
    host,
    searchable,
    windowObj
  ]);

  useLayoutEffect(() => {
    openRef.current = open;
    host.dataset.open = open ? 'true' : 'false';
    if (!open) {
      // A reopened menu starts from the whole list again.
      setFilter('');
      return undefined;
    }
    // Measured afresh for this open, or for a list that changed while open.
    searchableNaturalHeightRef.current = null;
    const selectedIndex = visibleOptionsRef.current.findIndex(
      (option) => !option.action && !option.checkbox &&
        option.value === selectedValue &&
        !option.disabled
    );
    setActiveIndex(selectedIndex);
    positionMenu();
    if (searchable) {
      filterRef.current?.focus();
    }
    const onViewportChange = () => positionMenu();
    windowObj.addEventListener('resize', onViewportChange);
    windowObj.addEventListener('scroll', onViewportChange, true);
    const ResizeObserverCtor = windowObj.ResizeObserver;
    const resizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(onViewportChange) : null;
    if (triggerRef.current) resizeObserver?.observe(triggerRef.current);
    if (menuRef.current) resizeObserver?.observe(menuRef.current);
    if (config.menuPortalContainer) resizeObserver?.observe(config.menuPortalContainer);
    windowObj.visualViewport?.addEventListener('resize', onViewportChange);
    windowObj.visualViewport?.addEventListener('scroll', onViewportChange);
    return () => {
      windowObj.removeEventListener('resize', onViewportChange);
      windowObj.removeEventListener('scroll', onViewportChange, true);
      resizeObserver?.disconnect();
      windowObj.visualViewport?.removeEventListener('resize', onViewportChange);
      windowObj.visualViewport?.removeEventListener('scroll', onViewportChange);
    };
  }, [config.menuPortalContainer, host, open, options, positionMenu, searchable, selectedValue, windowObj]);

  useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }
    const activeOption = (menuRef.current ? queryHtmlElement(menuRef.current, '._x_extension_select_option_2024_unique_[data-active="true"]') : null);
    activeOption?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = isNode(event.target) ? event.target : null;
      if (
        target &&
        !host.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape that drops an IME composition (in a searchable menu's filter)
      // belongs to the IME, not the menu.
      if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = isNode(event.target) ? event.target : null;
      if (target && !host.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    documentObj.addEventListener('pointerdown', onPointerDown, true);
    documentObj.addEventListener('keydown', onKeyDown, true);
    documentObj.addEventListener('focusin', onFocusIn, true);
    return () => {
      documentObj.removeEventListener('pointerdown', onPointerDown, true);
      documentObj.removeEventListener('keydown', onKeyDown, true);
      documentObj.removeEventListener('focusin', onFocusIn, true);
    };
  }, [documentObj, host, open, setOpen]);

  useLayoutEffect(() => {
    registerControls?.({
      isOpen: () => openRef.current,
      setOpen,
      syncValue(value) {
        setSelectedValue(String(value ?? ''));
      }
    });
  }, [registerControls, setOpen]);

  const chooseOption = (option: SelectMenuOption) => {
    if (option.disabled) {
      return;
    }
    if (option.action) {
      config.onAction?.({ action: option.action, option });
      setOpen(false);
      return;
    }
    if (option.checkbox) {
      config.onCheckedChange?.(option.value, option.checked !== true);
      return;
    }
    if (config.onValueChange?.(option.value) === false) {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    setSelectedValue(option.value);
    const select = selectRef.current;
    if (select) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setOpen(false);
    triggerRef.current?.focus();
  };
  const isValueOption = (option: SelectMenuOption) => !option.action && !option.checkbox;
  const selectedOption =
    options.find((option) => isValueOption(option) && option.value === selectedValue) ||
    options.find(isValueOption);
  const usesMenuSemantics = options.some(
    (option) => Boolean(option.action || option.radio || option.checkbox)
  );
  const getOptionId = (index: number) =>
    config.id ? `${config.id}_option_${index}` : undefined;
  const activeOptionId = open && activeIndex >= 0 && visibleOptions[activeIndex]
    ? getOptionId(activeIndex)
    : undefined;
  const valueId = config.ariaLabelledBy && config.id ? `${config.id}_value` : undefined;
  const menuId = config.id ? `${config.id}_menu` : undefined;
  // A searchable menu is a combobox: the filter field keeps focus and points
  // at the active option, and only the options sit in the listbox.
  const listboxId = searchable && config.id ? `${config.id}_listbox` : menuId;
  const menuMinWidth = toCssLength(config.menuMinWidth, '0');
  const menuMaxWidth = toCssLength(
    config.menuMaxWidth,
    'calc(100vw - 32px)'
  );
  const optionNodes = visibleOptions.map((option, index) => {
    const selected = isValueOption(option) && option.value === selectedValue;
    const radioItem = usesMenuSemantics && !option.checkbox && (!option.action || option.radio);
    const checked = option.radio || option.checkbox ? option.checked === true : selected;
    const trailingIconName = option.trailingIconName;
    return (
      <Fragment key={`${option.action || option.value}:${index}`}>
        {option.dividerBefore && index > 0 ? (
          <div
            aria-orientation={usesMenuSemantics ? 'horizontal' : undefined}
            className="_x_extension_select_divider_2026_unique_"
            role={usesMenuSemantics ? 'separator' : 'presentation'}
          />
        ) : null}
        {option.groupTitle ? (
          <div
            className="_x_extension_select_menu_title_2024_unique_"
            role="presentation"
          >
            {option.groupTitle}
          </div>
        ) : null}
        <div
          aria-checked={radioItem || option.checkbox ? checked : undefined}
          aria-disabled={option.disabled ? 'true' : undefined}
          aria-selected={!usesMenuSemantics ? selected : undefined}
          className={`_x_extension_select_option_2024_unique_${
            option.radio ? ' _x_extension_select_option_radio_2026_unique_' : ''
          }`}
          data-active={open && activeIndex === index ? 'true' : undefined}
          id={getOptionId(index)}
          data-radio-checked={
            option.radio ? (checked ? 'true' : 'false') : undefined
          }
          data-selected={selected ? 'true' : 'false'}
          data-value={option.value}
          onClick={() => chooseOption(option)}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(-1)}
          role={
            usesMenuSemantics
              ? option.checkbox
                ? 'menuitemcheckbox'
                : radioItem
                  ? 'menuitemradio'
                  : 'menuitem'
              : 'option'
          }
        >
          {option.checkbox ? (
            <span
              aria-hidden="true"
              className="_x_extension_select_option_checkbox_2026_unique_"
            />
          ) : null}
          {option.iconUrl ? (
            <img
              alt=""
              aria-hidden="true"
              className="_x_extension_select_option_icon_2026_unique_"
              src={option.iconUrl}
            />
          ) : option.iconName ? (
            <RemixIcon className="_x_extension_select_option_icon_2026_unique_" name={option.iconName} size={16} />
          ) : null}
          <span
            className="_x_extension_select_option_label_2026_unique_"
            style={option.fontFamily ? { fontFamily: getFontPreviewFamily(option.fontFamily) } : undefined}
          >
            {option.label}
          </span>
          {option.badge ? (
            <span className="_x_extension_select_option_badge_2026_unique_">
              {option.badge}
            </span>
          ) : null}
          {option.radio && trailingIconName ? (
            <span
              aria-hidden="true"
              className="_x_extension_select_option_check_2026_unique_"
            >
              <RemixIcon name={trailingIconName} size={16} />
            </span>
          ) : null}
        </div>
      </Fragment>
    );
  });
  const menu = (
    <div
      aria-hidden={!open}
      id={menuId}
      className={`_x_extension_select_menu_2024_unique_ _x_extension_menu_surface_2024_unique_${
        config.menuClassName ? ` ${config.menuClassName}` : ''
      }`}
      data-react-select-owner={config.id || undefined}
      data-menu-portal-active={config.menuPortal ? 'true' : undefined}
      data-menu-surface-width={
        config.menuWidth === 'content' ? 'content' : undefined
      }
      data-open={open ? 'true' : 'false'}
      data-searchable={searchable ? 'true' : undefined}
      ref={menuRef}
      role={searchable ? undefined : usesMenuSemantics ? 'menu' : 'listbox'}
      style={
        {
          '--x-extension-menu-surface-max-width': menuMaxWidth,
          '--x-extension-menu-surface-min-width': menuMinWidth,
          transformOrigin: config.menuAlign === 'right' ? 'top right' : config.menuAlign === 'left' ? 'top left' : 'top center',
          left: 0,
          right: 'auto',
          // Body portals are fixed once opened; start fixed so a closed menu never
          // stretches a scrolling page (mobile new tab flows in the document).
          ...(config.menuPortal !== false && !config.menuPortalContainer ? { position: 'fixed' } : null)
        }
      }
    >
      {searchable ? (
        // The field sits above the scrolling listbox, so the list's scrollbar
        // never runs past it; it is the first thing focused when the menu opens.
        <div className="_x_extension_select_search_2026_unique_">
          <input
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={open}
            aria-label={config.searchPlaceholder}
            className={`_x_extension_select_search_input_2026_unique_${
              config.searchInputClassName ? ` ${config.searchInputClassName}` : ''
            }`}
            onChange={(event) => {
              const nextFilter = event.currentTarget.value;
              setFilter(nextFilter);
              setActiveIndex(
                findNextEnabledOptionIndex(filterOptions(options, nextFilter), -1, 1)
              );
            }}
            onKeyDown={(event) => {
              // While an IME composes, Enter commits the pinyin and the arrows
              // move through its candidates; none of them belong to the menu.
              if (event.nativeEvent.isComposing || event.keyCode === 229) {
                return;
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((current) =>
                  findNextEnabledOptionIndex(
                    visibleOptions,
                    current,
                    event.key === 'ArrowDown' ? 1 : -1
                  )
                );
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (visibleOptions[activeIndex]) {
                  chooseOption(visibleOptions[activeIndex]);
                }
                return;
              }
              // Focus leaves with Tab, so the menu should not stay open behind it.
              if (event.key === 'Tab') {
                setOpen(false);
              }
            }}
            placeholder={config.searchPlaceholder}
            ref={filterRef}
            role="combobox"
            spellCheck={false}
            type="text"
            value={filter}
          />
          <RemixIcon className="_x_extension_select_search_icon_2026_unique_" name="ri-search-line" size={16} />
        </div>
      ) : null}
      {searchable && !visibleOptions.length && config.emptyLabel ? (
        <div className="_x_extension_select_empty_2026_unique_" role="presentation">
          {config.emptyLabel}
        </div>
      ) : null}
      {config.menuTitle ? (
        <div
          className="_x_extension_select_menu_title_2024_unique_"
          role="presentation"
        >
          {config.menuTitle}
        </div>
      ) : null}
      {searchable ? (
        <div className="_x_extension_select_listbox_2026_unique_" id={listboxId} role="listbox">
          {optionNodes}
        </div>
      ) : optionNodes}
    </div>
  );

  return (
    <Fragment>
      <select
        aria-hidden="true"
        className="_x_extension_select_2024_unique_"
        id={config.selectId}
        disabled={config.disabled}
        ref={selectRef}
        tabIndex={-1}
        value={selectedValue}
        onChange={(event) => setSelectedValue(event.currentTarget.value)}
      >
        {options
          .filter(isValueOption)
          .map((option) => (
            <option
              disabled={option.disabled}
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
      </select>
      <button
        aria-activedescendant={activeOptionId}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup={usesMenuSemantics ? 'menu' : 'listbox'}
        aria-label={valueId ? undefined : config.ariaLabel}
        aria-labelledby={valueId ? `${config.ariaLabelledBy} ${valueId}` : undefined}
        className="_x_extension_select_trigger_2024_unique_"
        disabled={config.disabled}
        data-tooltip={config.tooltip}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(!openRef.current);
        }}
        onKeyDown={(event) => {
          if (
            openRef.current &&
            (event.key === 'Home' || event.key === 'End')
          ) {
            event.preventDefault();
            setActiveIndex(
              event.key === 'Home'
                ? findNextEnabledOptionIndex(visibleOptions, -1, 1)
                : findNextEnabledOptionIndex(visibleOptions, 0, -1)
            );
            return;
          }
          if (
            event.key === 'ArrowDown' ||
            event.key === 'ArrowUp' ||
            event.key === 'Enter' ||
            event.key === ' '
          ) {
            event.preventDefault();
            if (!openRef.current) {
              setOpen(true);
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              if (!visibleOptions.length) {
                return;
              }
              setActiveIndex((current) => {
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                return findNextEnabledOptionIndex(visibleOptions, current, delta);
              });
              return;
            }
            if (visibleOptions[activeIndex]) {
              chooseOption(visibleOptions[activeIndex]);
            }
          }
        }}
        ref={triggerRef}
        type="button"
      >
        {selectedOption?.iconUrl ? (
          <img
            alt=""
            aria-hidden="true"
            className="_x_extension_select_value_icon_2026_unique_"
            src={selectedOption.iconUrl}
          />
        ) : null}
        <span
          aria-hidden={valueId ? undefined : 'true'}
          className="_x_extension_select_label_2024_unique_"
          id={valueId}
        >
          {config.triggerLabel ?? (selectedOption?.label || '')}
        </span>
        <RemixIcon className="_x_extension_select_icon_2024_unique_" name={config.triggerIconName || 'ri-arrow-down-s-line'} size={16} />
      </button>
      {config.menuPortal !== false
        ? createPortal(menu, config.menuPortalContainer || documentObj.body)
        : menu}
    </Fragment>
  );
}
