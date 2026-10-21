(function(root) {
  // Shortcut tiles on the page: finding a tile and its shortcut, the
  // context menu's options, opening the shortcut dialog to add or edit, the
  // icon plate color picker, and the copy the dialog and menus show.
  function createShortcutPageActions(deps) {
    const {
      folderColorApi,
      t,
      bindShortcutDialogTooltip,
      hideShortcutDialogTooltip,
      folderColorStorage,
      storageArea,
      FOLDER_COLOR_PRESETS_STORAGE_KEY,
      SHORTCUT_GROUP_MENU_VALUES,
      getShortcutGroups,
      NEWTAB_SHORTCUTS_STORE,
      SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE,
      MAX_NEWTAB_SHORTCUTS,
      NEWTAB_CONTEXT_MENU_OPEN_VALUE,
      BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE,
      NEWTAB_BOOKMARKS_STORE,
      bookmarksRuntime,
      getShortcutFolderId,
      SHORTCUT_CONTEXT_MENU_EDIT_VALUE,
      FOLDER_COLOR_CONTEXT_MENU_VALUE,
      SHORTCUT_CONTEXT_MENU_REMOVE_VALUE,
      formatMessage,
      updateBookmarkContextMenuLanguageStrings,
      updateRecentContextMenuLanguageStrings,
      createShortcutDialogComponent,
      showToast,
      shortcutTiles,
      openBookmarkEditor,
      getShortcutTitle,
      SHORTCUT_DIALOG_MODE_EDIT,
      getShortcutIconDataUrl
    } = deps;

    // The page state object shared with newtab.js and the other modules.
    const pageState = deps.pageState;

    let shortcutDialogLoadPromise = null;
    let shortcutDialogOpenRevision = 0;

    // The folder color picker, over the shortcut dialog, for an icon's plate.
    // It shares the saved colors with folders; the shortcut dialog saves the
    // result. Resolves with a color, null to follow the icon, or undefined.
    async function pickShortcutIconPlateColor(request) {
      if (!pageState.shortcutPlateColorPicker) {
        try {
          pageState.shortcutPlateColorPicker = await folderColorApi.createFolderColorPicker({
            documentObj: document, t,
            bindTooltip: bindShortcutDialogTooltip,
            hideTooltip: hideShortcutDialogTooltip,
            readSavedColors: () => folderColorStorage(storageArea, 'get', [FOLDER_COLOR_PRESETS_STORAGE_KEY])
              .then((data) => data[FOLDER_COLOR_PRESETS_STORAGE_KEY]),
            saveSavedColors: (colors) => folderColorStorage(storageArea, 'set', { [FOLDER_COLOR_PRESETS_STORAGE_KEY]: colors }),
            onSubmit: (_id, color) => {
              pageState.shortcutPlateColorPick?.(color);
              return Promise.resolve();
            },
            onClose: () => pageState.shortcutPlateColorPick?.(undefined)
          });
        } catch {
          return undefined;
        }
      }
      return new Promise((resolve) => {
        pageState.shortcutPlateColorPick = (color) => {
          pageState.shortcutPlateColorPick = null;
          resolve(color);
        };
        const label = t('newtab_shortcuts_icon_plate_color_label', 'Background color');
        pageState.shortcutPlateColorPicker.open({
          folderId: 'shortcut-icon-plate',
          title: request.title,
          color: request.color,
          presets: request.presets,
          previewImageUrl: request.imageUrl,
          labels: {
            dialog: label,
            picker: label,
            defaultColor: t('newtab_shortcuts_icon_plate_color_auto', 'From the icon')
          },
          sourceElement: request.sourceElement
        });
      });
    }

    function updateShortcutDialogLanguageStrings() {
      if (pageState.shortcutDialogController) {
        pageState.shortcutDialogController.updateLanguage();
      }
    }

    function getShortcutContextMenuOptions(target) {
      const createGroupOption = {
        action: SHORTCUT_GROUP_MENU_VALUES.create,
        value: SHORTCUT_GROUP_MENU_VALUES.create,
        label: t('newtab_shortcuts_group_new', 'New group')
      };
      if (target && target.kind === 'add') {
        return [
          {
            action: SHORTCUT_GROUP_MENU_VALUES.addShortcut,
            value: SHORTCUT_GROUP_MENU_VALUES.addShortcut,
            label: t('newtab_shortcuts_add_site', 'Add site')
          },
          { ...createGroupOption, disabled: getShortcutGroups().length >= NEWTAB_SHORTCUTS_STORE.DEFAULT_MAX_SHORTCUT_GROUPS },
          {
            value: SHORTCUT_CONTEXT_MENU_HIDE_ADD_VALUE,
            label: t('newtab_shortcuts_hide_add', 'Hide'),
            dividerBefore: true
          }
        ];
      }
      if (target && target.kind === 'group') {
        const groups = getShortcutGroups();
        const index = groups.findIndex((group) => group.id === target.groupId);
        const hasSites = pageState.newtabShortcuts.some((item) => item.groupId === target.groupId);
        const option = (value, label, extra) => ({ action: value, value, label, ...(extra || {}) });
        return [
          option(SHORTCUT_GROUP_MENU_VALUES.rename, t('newtab_shortcuts_group_rename', 'Rename')),
          option(SHORTCUT_GROUP_MENU_VALUES.addSite, t('newtab_shortcuts_group_add_site', 'Add site'), {
            disabled: pageState.newtabShortcuts.length >= MAX_NEWTAB_SHORTCUTS
          }),
          option(SHORTCUT_GROUP_MENU_VALUES.moveUp, t('newtab_shortcuts_group_move_up', 'Move up'), {
            dividerBefore: true, disabled: index <= 0
          }),
          option(SHORTCUT_GROUP_MENU_VALUES.moveDown, t('newtab_shortcuts_group_move_down', 'Move down'), {
            disabled: index < 0 || index >= groups.length - 1
          }),
          { ...createGroupOption, disabled: groups.length >= NEWTAB_SHORTCUTS_STORE.DEFAULT_MAX_SHORTCUT_GROUPS },
          option(SHORTCUT_GROUP_MENU_VALUES.delete, t('newtab_shortcuts_group_delete', 'Delete group'), {
            dividerBefore: true, disabled: groups.length <= 1
          }),
          ...(hasSites ? [option(SHORTCUT_GROUP_MENU_VALUES.deleteWithSites,
            t('newtab_shortcuts_group_delete_with_sites', 'Delete group and sites'), {
              disabled: groups.length <= 1
            })] : [])
        ];
      }
      const shortcut = target && getShortcutById(target.shortcutId);
      if (shortcut && shortcut.type === 'folder') {
        return [
          { action: NEWTAB_CONTEXT_MENU_OPEN_VALUE, value: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
            label: t('newtab_shortcuts_open_folder', 'Open folder') },
          { action: BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE, value: BOOKMARK_CONTEXT_MENU_OPEN_GROUP_VALUE,
            label: t('bookmarks_open_in_new_tab_group', 'Open in new tab group'),
            disabled: NEWTAB_BOOKMARKS_STORE.collectFolderBookmarkUrls(
              bookmarksRuntime.getNode(getShortcutFolderId(shortcut))
            ).length <= 0 },
          { action: SHORTCUT_CONTEXT_MENU_EDIT_VALUE, value: SHORTCUT_CONTEXT_MENU_EDIT_VALUE,
            label: t('folder_rename', 'Rename'), dividerBefore: true },
          { action: FOLDER_COLOR_CONTEXT_MENU_VALUE, value: FOLDER_COLOR_CONTEXT_MENU_VALUE,
            label: t('folder_color_change', 'Change color') },
          { action: SHORTCUT_CONTEXT_MENU_REMOVE_VALUE, value: SHORTCUT_CONTEXT_MENU_REMOVE_VALUE,
            label: t('shortcuts_remove', 'Remove') }
        ];
      }
      return [
        {
          action: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
          value: NEWTAB_CONTEXT_MENU_OPEN_VALUE,
          label: t('newtab_open_in_new_tab', 'Open in new tab')
        },
        {
          action: SHORTCUT_CONTEXT_MENU_EDIT_VALUE,
          value: SHORTCUT_CONTEXT_MENU_EDIT_VALUE,
          label: t('shortcuts_edit', 'Edit'),
          dividerBefore: true
        },
        {
          action: SHORTCUT_CONTEXT_MENU_REMOVE_VALUE,
          value: SHORTCUT_CONTEXT_MENU_REMOVE_VALUE,
          label: t('shortcuts_remove', 'Remove')
        }
      ];
    }

    function updateShortcutContextMenuLanguageStrings() {
      if (!pageState.shortcutContextMenu || !pageState.shortcutContextMenuSelectController) {
        return;
      }
      const label = t('newtab_shortcuts_context_menu_label', 'Shortcut actions');
      if (pageState.shortcutContextMenu.trigger) {
        pageState.shortcutContextMenu.trigger.setAttribute('aria-label', label);
      }
      if (typeof pageState.shortcutContextMenuSelectController.setOptions === 'function') {
        pageState.shortcutContextMenuSelectController.setOptions(
          pageState.shortcutContextMenu.control,
          getShortcutContextMenuOptions(pageState.shortcutContextMenuTarget),
          pageState.shortcutContextMenuTarget && pageState.shortcutContextMenuTarget.kind === 'group'
            ? SHORTCUT_GROUP_MENU_VALUES.rename
            : pageState.shortcutContextMenuTarget && pageState.shortcutContextMenuTarget.kind === 'add'
            ? SHORTCUT_GROUP_MENU_VALUES.addShortcut
            : NEWTAB_CONTEXT_MENU_OPEN_VALUE
        );
      }
    }

    function updateShortcutLanguageStrings() {
      if (pageState.shortcutSection) {
        pageState.shortcutSection.setAttribute('aria-label', t('newtab_shortcuts_section_label', 'Shortcuts'));
      }
      if (pageState.addShortcutButton) {
        const addLabel = t('newtab_shortcuts_add', 'Add shortcut');
        pageState.addShortcutButton.setAttribute('aria-label', addLabel);
        pageState.addShortcutButton.setAttribute('data-tooltip', addLabel);
      }
      updateShortcutDialogLanguageStrings();
      if (pageState.shortcutGrid) {
        Array.from(pageState.shortcutGrid.querySelectorAll('.x-nt-shortcut-tile[data-shortcut-url]')).forEach((tile) => {
          const title = tile.getAttribute('data-shortcut-title') || '';
          tile.setAttribute('aria-label', formatMessage('open_prefix', '打开 {title}', { title }));
        });
      }
      updateShortcutContextMenuLanguageStrings();
      updateBookmarkContextMenuLanguageStrings();
      updateRecentContextMenuLanguageStrings();
    }

    function closeShortcutDialog(options) {
      shortcutDialogOpenRevision += 1;
      if (pageState.shortcutDialogController) {
        pageState.shortcutDialogController.close({
          ...(options || {}),
          force: true
        });
      }
    }

    async function openShortcutDialog(options) {
      const revision = ++shortcutDialogOpenRevision;
      try {
        if (!pageState.shortcutDialogController) {
          if (!shortcutDialogLoadPromise) {
            shortcutDialogLoadPromise = Promise.resolve(createShortcutDialogComponent()).then((controller) => {
              if (!controller) throw new Error('Shortcut dialog unavailable');
              pageState.shortcutDialogController = controller;
              controller.mount(document.body);
            }).finally(() => { shortcutDialogLoadPromise = null; });
          }
          await shortcutDialogLoadPromise;
        }
        if (revision === shortcutDialogOpenRevision) pageState.shortcutDialogController.open(options);
      } catch (error) {
        console.warn('[Lumno] Failed to load shortcut dialog', error);
        if (revision === shortcutDialogOpenRevision) showToast(t('toast_error', 'Operation failed. Please try again.'), true);
      }
    }

    function getShortcutTileFromNode(node) {
      if (!pageState.shortcutGrid || !node) {
        return null;
      }
      const tile = typeof node.closest === 'function'
        ? node.closest('.x-nt-shortcut-tile')
        : null;
      return tile && pageState.shortcutGrid.contains(tile) ? tile : null;
    }

    function getShortcutTileId(tile) {
      return tile && typeof tile.getAttribute === 'function'
        ? tile.getAttribute('data-shortcut-id') || ''
        : '';
    }

    function refreshShortcutTileCacheFromDom() {
      if (!pageState.shortcutGrid) {
        return;
      }
      shortcutTiles.length = 0;
      Array.from(pageState.shortcutGrid.querySelectorAll('.x-nt-shortcut-tile[data-shortcut-id]')).forEach((tile) => {
        shortcutTiles.push(tile);
      });
    }

    function getShortcutReorderTiles() {
      return pageState.shortcutGrid
        ? Array.from(pageState.shortcutGrid.querySelectorAll('.x-nt-shortcut-tile[data-shortcut-id]'))
        : [];
    }

    function getShortcutById(shortcutId) {
      const id = String(shortcutId || '');
      if (!id) {
        return null;
      }
      return pageState.newtabShortcuts.find((item) => item && item.id === id) || null;
    }

    function getShortcutTileById(shortcutId) {
      const id = String(shortcutId || '');
      if (!id) {
        return null;
      }
      return getShortcutReorderTiles().find((tile) => getShortcutTileId(tile) === id) || null;
    }

    function handleShortcutNativeDragStart(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    }

    function openShortcutEditor(shortcut, sourceElement) {
      if (!shortcut) {
        return;
      }
      if (shortcut.type === 'folder') {
        openBookmarkEditor({ bookmarkId: getShortcutFolderId(shortcut), isFolder: true,
          title: getShortcutTitle(shortcut), element: sourceElement });
        return;
      }
      openShortcutDialog({
        mode: SHORTCUT_DIALOG_MODE_EDIT,
        shortcut: {
          ...shortcut,
          iconDataUrl: getShortcutIconDataUrl(shortcut.id)
        },
        sourceElement
      });
    }

    function isShortcutFolderAnchor(element) {
      return Boolean(element && element.classList && element.classList.contains('x-nt-shortcut-tile'));
    }

    return {
      pickShortcutIconPlateColor,
      getShortcutContextMenuOptions,
      updateShortcutLanguageStrings,
      closeShortcutDialog,
      openShortcutDialog,
      getShortcutTileFromNode,
      getShortcutTileId,
      refreshShortcutTileCacheFromDom,
      getShortcutReorderTiles,
      getShortcutById,
      getShortcutTileById,
      handleShortcutNativeDragStart,
      openShortcutEditor,
      isShortcutFolderAnchor
    };
  }

  root.LumnoNewtabShortcutPageActions = { createShortcutPageActions };
})(globalThis);
