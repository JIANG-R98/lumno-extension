// The mode selects in the bookmark and recent section headers: their
// options (view modes, recent sources) and the React select each header hosts.
import type { SelectMenuOption } from '../shared/react/select-menu';
import type { TooltipShowOptions } from '../shared/ui/tooltip';
import type { SelectMenuController, Translate } from './newtab-types';

// A menu entry as a header describes it, with its label by message key.
interface SectionModeOptionSource {
  value: string;
  labelKey: string;
  fallback: string;
  action?: string;
  iconClass?: string;
  dividerBefore?: boolean;
  groupTitleKey?: string;
  groupTitleFallback?: string;
  radio?: boolean;
  checked?: boolean;
  trailingIconClass?: string;
}

interface SectionModeSelectConfig {
  id: string;
  menuTitleKey: string;
  menuTitleFallback?: string;
  getValue?(): string;
  onChange?(mode: string): void;
  onAction?(action: string): void;
  getOptions?(): SectionModeOptionSource[];
  options?: SectionModeOptionSource[];
}

interface SectionModeSelect {
  control: HTMLElement;
  select: HTMLSelectElement;
  trigger: HTMLButtonElement;
  // Takes the current title, value and options again.
  update(): void;
}

interface SectionModeSelectDeps {
  t: Translate;
  getEffectiveBookmarkTopbarSurfaceMode(): string;
  isBookmarkTopbarMode(): boolean;
  getBookmarkTopbarLayout(): string;
  BOOKMARK_TOPBAR_LAYOUT_ACTION: string;
  BOOKMARK_TOPBAR_SURFACE_MODE_ACTION: string;
  BOOKMARK_TOPBAR_PICK_COLOR_ACTION: string;
  sectionModeSelectController: SelectMenuController | null;
  showTopActionTooltip(target: HTMLElement, text: string, options?: TooltipShowOptions): void;
  hideTopActionTooltip(): void;
}

function createSectionModeSelect(deps: SectionModeSelectDeps) {
  const {
    t,
    getEffectiveBookmarkTopbarSurfaceMode,
    isBookmarkTopbarMode,
    getBookmarkTopbarLayout,
    BOOKMARK_TOPBAR_LAYOUT_ACTION,
    BOOKMARK_TOPBAR_SURFACE_MODE_ACTION,
    BOOKMARK_TOPBAR_PICK_COLOR_ACTION,
    sectionModeSelectController,
    showTopActionTooltip,
    hideTopActionTooltip
  } = deps;

  const SECTION_MODE_MENU_MIN_WIDTH_PX = 168;
  const SECTION_MODE_MENU_MAX_WIDTH_PX = 240;
  const SECTION_MODE_MENU_PORTAL_Z_INDEX = 10020;
  const SECTION_MODE_MENU_PORTAL_OFFSET_PX = 8;

  function getSectionModeSelectOptions(config: SectionModeSelectConfig): SelectMenuOption[] {
    const rawOptions = typeof config.getOptions === 'function'
      ? config.getOptions()
      : config.options;
    const options = Array.isArray(rawOptions) ? rawOptions : [];
    return options.map((item) => {
      const value = String(item && item.value !== undefined ? item.value : '');
      const option: SelectMenuOption = {
        value,
        label: t(item && item.labelKey, (item && item.fallback) || value)
      };
      if (item && item.action) {
        option.action = String(item.action);
      }
      if (item && item.iconClass) {
        option.iconClass = String(item.iconClass);
      }
      if (item && item.dividerBefore) {
        option.dividerBefore = true;
      }
      if (item && item.groupTitleKey) {
        option.groupTitle = t(item.groupTitleKey, item.groupTitleFallback || '');
      }
      if (item && item.radio) {
        option.radio = true;
        option.checked = item.checked === true;
      }
      if (item && item.trailingIconClass) {
        option.trailingIconClass = String(item.trailingIconClass);
      }
      return option;
    });
  }

  function getBookmarkViewModeOptions(): SectionModeOptionSource[] {
    const effectiveSurfaceMode = getEffectiveBookmarkTopbarSurfaceMode();
    const options: SectionModeOptionSource[] = [
      {
        value: 'folder',
        labelKey: 'bookmark_view_mode_folder',
        fallback: 'Multi-layer folder view'
      },
      {
        value: 'list',
        labelKey: 'bookmark_view_mode_list',
        fallback: 'Multi-level list view'
      },
      {
        value: 'top',
        labelKey: 'bookmark_view_mode_top',
        fallback: 'Top bookmarks bar'
      }
    ];
    if (!isBookmarkTopbarMode()) {
      return options;
    }
    const layout = getBookmarkTopbarLayout();
    options.push({
      value: '__bookmark_topbar_layout_docked__',
      action: `${BOOKMARK_TOPBAR_LAYOUT_ACTION}:docked`,
      labelKey: 'bookmark_topbar_layout_docked',
      fallback: 'Docked to top',
      radio: true,
      checked: layout === 'docked',
      dividerBefore: true,
      groupTitleKey: 'bookmark_topbar_layout_title',
      groupTitleFallback: 'Bar style'
    });
    options.push({
      value: '__bookmark_topbar_layout_floating__',
      action: `${BOOKMARK_TOPBAR_LAYOUT_ACTION}:floating`,
      labelKey: 'bookmark_topbar_layout_floating',
      fallback: 'Floating',
      radio: true,
      checked: layout === 'floating'
    });
    options.push({
      value: '__bookmark_topbar_surface_adaptive__',
      action: `${BOOKMARK_TOPBAR_SURFACE_MODE_ACTION}:adaptive`,
      labelKey: 'bookmark_topbar_surface_follow',
      fallback: 'Match style',
      radio: true,
      checked: effectiveSurfaceMode === 'adaptive',
      dividerBefore: true,
      groupTitleKey: 'bookmark_topbar_surface_title',
      groupTitleFallback: 'Bar background'
    });
    options.push({
      value: '__bookmark_topbar_surface_transparent__',
      action: `${BOOKMARK_TOPBAR_SURFACE_MODE_ACTION}:transparent`,
      labelKey: 'bookmark_topbar_surface_transparent',
      fallback: 'Transparent',
      radio: true,
      checked: effectiveSurfaceMode === 'transparent'
    });
    options.push({
      value: '__pick_bookmark_topbar_color__',
      action: BOOKMARK_TOPBAR_PICK_COLOR_ACTION,
      labelKey: 'bookmark_topbar_surface_custom',
      fallback: 'Custom color',
      radio: true,
      trailingIconClass: 'ri-dropper-line',
      checked: effectiveSurfaceMode === 'custom'
    });
    return options;
  }

  function createSectionModeSelect(config: SectionModeSelectConfig): SectionModeSelect | null {
    // Narrowed here, for the handlers below.
    const controller = sectionModeSelectController;
    if (!controller) {
      return null;
    }
    const currentValue = typeof config.getValue === 'function' ? config.getValue() : '';
    const title = t(config.menuTitleKey, config.menuTitleFallback || 'Display mode');
    const created = controller.createSelect({
      id: config.id,
      selectId: config.id ? `${config.id}_select` : '',
      className: 'x-nt-section-mode-select',
      iconOnly: true,
      triggerIconClass: 'ri-more-line',
      menuClassName: 'x-nt-section-mode-portal',
      menuAlign: 'left',
      menuWidth: 'content',
      menuMinWidth: SECTION_MODE_MENU_MIN_WIDTH_PX,
      menuMaxWidth: SECTION_MODE_MENU_MAX_WIDTH_PX,
      menuPortal: true,
      menuPortalZIndex: SECTION_MODE_MENU_PORTAL_Z_INDEX,
      menuPortalOffset: SECTION_MODE_MENU_PORTAL_OFFSET_PX,
      menuTitle: title,
      value: currentValue,
      ariaLabel: title,
      tooltip: title,
      onAction: (payload) => {
        if (typeof config.onAction === 'function') config.onAction(payload.action);
      },
      options: getSectionModeSelectOptions(config)
    });
    if (!created) {
      return null;
    }
    const control = created.wrapper;
    const select = created.select;
    const trigger = created.trigger;
    const api: SectionModeSelect = {
      control,
      select,
      trigger,
      update: () => {
        const nextTitle = t(config.menuTitleKey, config.menuTitleFallback || 'Display mode');
        const nextValue = typeof config.getValue === 'function' ? config.getValue() : '';
        const nextOptions = getSectionModeSelectOptions(config);
        controller.setMenuTitle(control, nextTitle);
        controller.setOptions(control, nextOptions, nextValue);
        trigger.setAttribute('aria-label', nextTitle);
        trigger.setAttribute('data-tooltip', nextTitle);
      }
    };
    select.addEventListener('change', () => {
      const nextMode = String(select.value || '');
      if (typeof config.onChange === 'function') {
        config.onChange(nextMode);
      }
    });
    const showButtonTooltip = () => {
      if (controller.isOpen(control)) {
        return;
      }
      const placement = trigger.closest('.x-nt-bookmarks-topbar')
        ? 'bottom'
        : 'top';
      showTopActionTooltip(
        trigger,
        trigger.getAttribute('data-tooltip') || t('display_mode_title', 'Display mode'),
        { placement }
      );
    };
    trigger.addEventListener('mouseenter', showButtonTooltip);
    trigger.addEventListener('mouseleave', hideTopActionTooltip);
    trigger.addEventListener('focus', showButtonTooltip);
    trigger.addEventListener('blur', hideTopActionTooltip);
    api.update();
    return api;
  }

  return {
    getBookmarkViewModeOptions,
    createSectionModeSelect
  };
}

export { createSectionModeSelect };
export type { SectionModeOptionSource, SectionModeSelect, SectionModeSelectConfig, SectionModeSelectDeps };
