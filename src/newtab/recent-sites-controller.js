(function(root) {
  // Pinned and hidden recent sites, and the recent-site context menu.
  function createRecentSitesController(deps) {
    const {
      NEWTAB_CONTEXT_MENU_OPEN_VALUE,
      t,
      showToast,
      openExternalNewTabUrl,
      closeShortcutContextMenu,
      closeBookmarkContextMenu,
      canDismissRecentCard,
      hideCursorTooltip,
      hideTopActionTooltip,
      normalizeHost,
      getHostFromUrl,
      getCanonicalPageUrlForFavicon,
      sanitizeDisplayText,
      getSiteDisplayName,
      shouldExcludeFromRecentSites,
      isBrowserPageRecentUrl,
      MAX_PINNED_RECENT_SITES,
      NEWTAB_RECENT_STORE,
      recentSitesStorageArea,
      HIDDEN_RECENT_SITES_STORAGE_KEY,
      renderRecentSites,
      PINNED_RECENT_SITES_STORAGE_KEY
    } = deps;

    // Page state still owned by newtab.js; read and written through accessors.
    const pageState = deps.pageState;

    const MAX_HIDDEN_RECENT_SITES = 60;
    const RECENT_CONTEXT_MENU_REMOVE_VALUE = 'remove';
    const RECENT_CONTEXT_MENU_MIN_WIDTH_PX = 124;
    const RECENT_CONTEXT_MENU_MAX_WIDTH_PX = 180;
    const RECENT_CONTEXT_MENU_PORTAL_Z_INDEX = 10050;
    const RECENT_CONTEXT_MENU_PORTAL_OFFSET_PX = -6;

    function getRecentContextMenuOptions(target) {
      return [
        {
          action: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
          value: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
          label: t('newtab_open_in_new_tab', 'Open in new tab')
        },
        {
          action: RECENT_CONTEXT_MENU_REMOVE_VALUE,
          value: RECENT_CONTEXT_MENU_REMOVE_VALUE,
          label: target && target.item
            ? getRecentDismissTooltip(target.item)
            : t('recent_dismiss_tooltip', 'Remove'),
          dividerBefore: true
        }
      ];
    }

    function isRecentContextMenuOpen() {
      return Boolean(
        pageState.recentContextMenu &&
        pageState.recentContextMenuSelectController &&
        pageState.recentContextMenuSelectController.isOpen(pageState.recentContextMenu.control)
      );
    }

    function isRecentContextMenuNode(node) {
      if (!node || !pageState.recentContextMenu) {
        return false;
      }
      const { control, menu } = pageState.recentContextMenu;
      return Boolean(
        (control && (node === control || (typeof control.contains === 'function' && control.contains(node)))) ||
        (menu && (node === menu || (typeof menu.contains === 'function' && menu.contains(node))))
      );
    }

    function clearRecentContextMenuTargetVisual() {
      const element = pageState.recentContextMenuTarget && pageState.recentContextMenuTarget.element;
      if (element && typeof element.removeAttribute === 'function') {
        element.removeAttribute('data-recent-context-menu-open');
      }
    }

    function closeRecentContextMenu() {
      clearRecentContextMenuTargetVisual();
      if (pageState.recentContextMenu && pageState.recentContextMenuSelectController) {
        pageState.recentContextMenuSelectController.setOpen(pageState.recentContextMenu.control, false);
      }
      pageState.recentContextMenuTarget = null;
    }

    function getRecentContextMenuPoint(target, event) {
      const clientX = Number(event && event.clientX);
      const clientY = Number(event && event.clientY);
      if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
        return { x: clientX, y: clientY };
      }
      const element = target && target.element;
      if (element && typeof element.getBoundingClientRect === 'function') {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + (rect.width / 2),
          y: rect.bottom
        };
      }
      return { x: 0, y: 0 };
    }

    function setRecentContextMenuPosition(target, event) {
      if (!pageState.recentContextMenu || !pageState.recentContextMenu.control) {
        return;
      }
      const point = getRecentContextMenuPoint(target, event);
      pageState.recentContextMenu.control.style.left = `${Math.round(point.x)}px`;
      pageState.recentContextMenu.control.style.top = `${Math.round(point.y)}px`;
    }

    function removeRecentSiteFromContextMenu(item) {
      return Promise.resolve(hideRecentSiteTemporarily(item)).then((result) => {
        if (!result || !result.hidden) {
          return;
        }
        showToast(
          result.wasPinned
            ? t(
              'recent_dismiss_pinned_toast',
              '已取消置顶并从最近访问移除，再次访问后会重新出现'
            )
            : t(
              'recent_dismiss_toast',
              '已从最近访问移除，再次访问后会重新出现'
            ),
          false
        );
      }).catch(() => {
        showToast(t('toast_error', '操作失败，请重试'), true);
      });
    }

    function handleRecentContextMenuAction(actionValue) {
      const action = String(actionValue || '');
      const target = pageState.recentContextMenuTarget;
      closeRecentContextMenu();
      if (!target || !target.item || !action) {
        return;
      }
      if (action === NEWTAB_CONTEXT_MENU_OPEN_VALUE) {
        openExternalNewTabUrl(target.item.url, 'newTab');
        return;
      }
      if (action !== RECENT_CONTEXT_MENU_REMOVE_VALUE) {
        return;
      }
      removeRecentSiteFromContextMenu(target.item);
    }

    function handleRecentContextMenuActionClick(event) {
      const target = event && event.target;
      const option = target && typeof target.closest === 'function'
        ? target.closest('._x_extension_select_option_2024_unique_')
        : null;
      if (!option || !pageState.recentContextMenu || !pageState.recentContextMenu.menu ||
          !pageState.recentContextMenu.menu.contains(option)) {
        return;
      }
      event.stopPropagation();
      handleRecentContextMenuAction(option.getAttribute('data-value'));
    }

    function handleRecentContextMenuDocumentPointerDown(event) {
      if (!pageState.recentContextMenuTarget || isRecentContextMenuNode(event.target)) {
        return;
      }
      closeRecentContextMenu();
    }

    function handleRecentContextMenuDocumentKeyDown(event) {
      if (event && event.key === 'Escape' &&
          (pageState.recentContextMenuTarget || isRecentContextMenuOpen())) {
        closeRecentContextMenu();
      }
    }

    function createRecentContextMenu() {
      if (!pageState.recentContextMenuSelectController ||
          typeof pageState.recentContextMenuSelectController.createSelect !== 'function') {
        return null;
      }
      const created = pageState.recentContextMenuSelectController.createSelect({
        id: '_x_extension_newtab_recent_context_menu_2026_unique_',
        selectId: '_x_extension_newtab_recent_context_menu_select_2026_unique_',
        className: 'x-nt-shortcut-context-menu x-nt-recent-context-menu',
        iconOnly: true,
        triggerIconClass: 'ri-more-line',
        menuClassName: 'x-nt-shortcut-context-menu-portal x-nt-recent-context-menu-portal',
        menuAlign: 'middle',
        menuWidth: 'content',
        menuMinWidth: RECENT_CONTEXT_MENU_MIN_WIDTH_PX,
        menuMaxWidth: RECENT_CONTEXT_MENU_MAX_WIDTH_PX,
        menuPortal: true,
        menuPortalZIndex: RECENT_CONTEXT_MENU_PORTAL_Z_INDEX,
        menuPortalOffset: RECENT_CONTEXT_MENU_PORTAL_OFFSET_PX,
        value: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
        ariaLabel: t('recent_context_menu_label', 'Recent site actions'),
        options: getRecentContextMenuOptions(),
        onAction(payload) {
          handleRecentContextMenuAction(payload && payload.action);
        }
      });
      const control = created.wrapper;
      const select = created.select;
      const trigger = created.trigger;
      const menu = created.menu;
      if (!control || !select || !trigger || !menu) {
        return null;
      }
      trigger.tabIndex = -1;
      const stopContextMenuEvent = (event) => {
        event.stopPropagation();
      };
      [control, trigger, menu].forEach((element) => {
        element.addEventListener('pointerdown', stopContextMenuEvent);
        element.addEventListener('click', stopContextMenuEvent);
        element.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
      });
      menu.addEventListener('click', handleRecentContextMenuActionClick);
      document.addEventListener('pointerdown', handleRecentContextMenuDocumentPointerDown, true);
      document.addEventListener('keydown', handleRecentContextMenuDocumentKeyDown, true);
      (document.body || document.documentElement).appendChild(control);
      return { control, select, trigger, menu };
    }

    function openRecentContextMenu(target, event) {
      if (!target || !target.item || !target.element) {
        return;
      }
      if (!pageState.recentContextMenu) {
        pageState.recentContextMenu = createRecentContextMenu();
      }
      if (!pageState.recentContextMenu || !pageState.recentContextMenuSelectController) {
        return;
      }
      closeShortcutContextMenu();
      closeBookmarkContextMenu();
      closeRecentContextMenu();
      pageState.recentContextMenuTarget = target;
      target.element.setAttribute('data-recent-context-menu-open', 'true');
      setRecentContextMenuPosition(target, event);
      if (typeof pageState.recentContextMenuSelectController.setOptions === 'function') {
        pageState.recentContextMenuSelectController.setOptions(
          pageState.recentContextMenu.control,
          getRecentContextMenuOptions(target),
          NEWTAB_CONTEXT_MENU_OPEN_VALUE
        );
      }
      pageState.recentContextMenuSelectController.setOpen(pageState.recentContextMenu.control, true);
    }

    function handleRecentCardContextMenu(payload) {
      const event = payload && payload.event;
      const item = payload && payload.item;
      const element = payload && payload.element;
      if (!event || !item || !element || !canDismissRecentCard()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      hideCursorTooltip();
      hideTopActionTooltip();
      openRecentContextMenu({ item, element }, event);
    }

    function getRecentStoreOptions(extraOptions) {
      return {
        normalizeHost,
        getHostFromUrl,
        getCanonicalPageUrlForFavicon,
        sanitizeDisplayText,
        getSiteDisplayName,
        shouldExcludeUrl: shouldExcludeFromRecentSites,
        shouldPrioritizeTabUrl: isBrowserPageRecentUrl,
        maxPinned: MAX_PINNED_RECENT_SITES,
        maxHidden: MAX_HIDDEN_RECENT_SITES,
        ...(extraOptions || {})
      };
    }

    function getRecentSiteUrlKey(item) {
      return NEWTAB_RECENT_STORE.getRecentSiteUrlKey(item);
    }

    function normalizeHiddenRecentSiteEntry(item) {
      return NEWTAB_RECENT_STORE.normalizeHiddenRecentSiteEntry(item);
    }

    function normalizeHiddenRecentSites(items) {
      return NEWTAB_RECENT_STORE.normalizeHiddenRecentSites(items, getRecentStoreOptions());
    }

    function readHiddenRecentSites() {
      return NEWTAB_RECENT_STORE.loadHiddenRecentSites(recentSitesStorageArea, getRecentStoreOptions({
        key: HIDDEN_RECENT_SITES_STORAGE_KEY
      }));
    }

    function writeHiddenRecentSites(items) {
      return NEWTAB_RECENT_STORE.saveHiddenRecentSites(recentSitesStorageArea, items, getRecentStoreOptions({
        key: HIDDEN_RECENT_SITES_STORAGE_KEY
      })).then((normalized) => {
        pageState.hiddenRecentSites = normalized;
        return normalized;
      });
    }

    function isRecentSiteHidden(item) {
      return NEWTAB_RECENT_STORE.isRecentSiteHidden(item, pageState.hiddenRecentSites);
    }

    function hideRecentSiteTemporarily(item) {
      const normalizedItem = normalizeRecentSiteRecord(item);
      const key = getRecentSiteUrlKey(normalizedItem);
      if (!normalizedItem || !key) {
        return Promise.resolve({ hidden: false, wasPinned: false });
      }
      const hiddenEntry = normalizeHiddenRecentSiteEntry({
        url: key,
        lastVisitTime: Number(normalizedItem.lastVisitTime) || 0,
        hiddenAt: Date.now()
      });
      const wasPinned = isRecentSitePinned(normalizedItem);
      const nextPinnedItems = wasPinned
        ? pageState.pinnedRecentSites.filter((pinnedItem) => !isSameRecentSite(pinnedItem, normalizedItem))
        : pageState.pinnedRecentSites.slice();
      const nextHiddenItems = [hiddenEntry].concat(
        pageState.hiddenRecentSites.filter((entry) => entry && entry.url !== key)
      );
      const persistPinned = wasPinned
        ? writePinnedRecentSites(nextPinnedItems)
        : Promise.resolve(pageState.pinnedRecentSites.slice());
      return persistPinned.then(() => writeHiddenRecentSites(nextHiddenItems)).then(() => {
        pageState.recentRenderSignature = '';
        renderRecentSites(pageState.recentSourceItems);
        return { hidden: true, wasPinned };
      });
    }

    function getRecentDismissTooltip(item) {
      const normalizedItem = normalizeRecentSiteRecord(item);
      if (normalizedItem && isRecentSitePinned(normalizedItem)) {
        return t(
          'recent_dismiss_pinned_tooltip',
          '取消置顶并从最近访问移除，再次访问后会重新出现'
        );
      }
      return t(
        'recent_dismiss_tooltip',
        '从最近访问移除，再次访问后会重新出现'
      );
    }

    function getRecentSiteHostKey(item) {
      return NEWTAB_RECENT_STORE.getRecentSiteHostKey(item, getRecentStoreOptions());
    }

    function normalizeRecentSiteRecord(item, options) {
      return NEWTAB_RECENT_STORE.normalizeRecentSiteItem(item, getRecentStoreOptions(options));
    }

    function isSameRecentSite(a, b) {
      return NEWTAB_RECENT_STORE.isSameRecentSite(a, b, getRecentStoreOptions());
    }

    function normalizePinnedRecentSites(items) {
      return NEWTAB_RECENT_STORE.normalizePinnedRecentSites(items, getRecentStoreOptions());
    }

    function readPinnedRecentSites() {
      return NEWTAB_RECENT_STORE.loadPinnedRecentSites(recentSitesStorageArea, getRecentStoreOptions({
        key: PINNED_RECENT_SITES_STORAGE_KEY
      }));
    }

    function writePinnedRecentSites(items) {
      return NEWTAB_RECENT_STORE.savePinnedRecentSites(recentSitesStorageArea, items, getRecentStoreOptions({
        key: PINNED_RECENT_SITES_STORAGE_KEY
      })).then((normalized) => {
        pageState.pinnedRecentSites = normalized;
        return normalized;
      });
    }

    function isRecentSitePinned(item) {
      return pageState.pinnedRecentSites.some((pinnedItem) => isSameRecentSite(pinnedItem, item));
    }

    function mergeRecentSitesWithPinned(items, limit) {
      return NEWTAB_RECENT_STORE.mergeRecentSitesWithPinned(
        items,
        pageState.pinnedRecentSites,
        pageState.hiddenRecentSites,
        limit,
        getRecentStoreOptions()
      );
    }

    function togglePinnedRecentSite(item) {
      const normalizedItem = normalizeRecentSiteRecord(item, { ignoreBlacklist: true });
      if (!normalizedItem) {
        return Promise.resolve({ pinned: false, limitReached: false });
      }
      const existingIndex = pageState.pinnedRecentSites.findIndex((pinnedItem) => isSameRecentSite(pinnedItem, normalizedItem));
      if (existingIndex >= 0) {
        const nextItems = pageState.pinnedRecentSites.filter((_, index) => index !== existingIndex);
        return writePinnedRecentSites(nextItems).then((savedItems) => {
          pageState.recentRenderSignature = '';
          renderRecentSites(pageState.recentSourceItems);
          return {
            pinned: false,
            limitReached: false,
            items: savedItems
          };
        });
      }
      if (pageState.pinnedRecentSites.length >= MAX_PINNED_RECENT_SITES) {
        return Promise.resolve({ pinned: false, limitReached: true, items: pageState.pinnedRecentSites.slice() });
      }
      const nextItems = [{
        ...normalizedItem,
        pinnedAt: Date.now()
      }].concat(pageState.pinnedRecentSites);
      return writePinnedRecentSites(nextItems).then((savedItems) => {
        pageState.recentRenderSignature = '';
        renderRecentSites(pageState.recentSourceItems);
        return {
          pinned: true,
          limitReached: false,
          items: savedItems
        };
      });
    }

    function updateRecentPinButton(button, isPinned, limitReached) {
      if (!button) {
        return;
      }
      button.classList.toggle('x-nt-recent-pin--active', Boolean(isPinned));
      button.disabled = false;
      button.classList.toggle('x-nt-recent-pin--limit', Boolean(!isPinned && limitReached));
      button.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
      const label = isPinned
        ? t('recent_pin_remove', '取消置顶')
        : (limitReached
          ? t('recent_pin_limit', '最多置顶 3 个')
          : t('recent_pin_add', '置顶'));
      button.setAttribute('aria-label', label);
      button.setAttribute('data-tooltip', label);
      button.removeAttribute('title');
      const icon = button.querySelector('[data-recent-pin-icon]');
      if (icon) {
        icon.className = `ri-icon ri-size-16 ${
          isPinned ? 'ri-pushpin-fill' : 'ri-pushpin-line'
        }`;
      }
    }

    return {
      getRecentContextMenuOptions,
      closeRecentContextMenu,
      handleRecentCardContextMenu,
      getRecentStoreOptions,
      getRecentSiteUrlKey,
      normalizeHiddenRecentSites,
      readHiddenRecentSites,
      writeHiddenRecentSites,
      isRecentSiteHidden,
      normalizeRecentSiteRecord,
      normalizePinnedRecentSites,
      readPinnedRecentSites,
      isRecentSitePinned,
      mergeRecentSitesWithPinned,
      togglePinnedRecentSite,
      updateRecentPinButton
    };
  }

  root.LumnoNewtabRecentSitesController = { createRecentSitesController };
})(globalThis);
