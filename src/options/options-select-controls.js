(function(root) {
  // The page's selects: their React controls and items, the clock font
  // and language selects, and the overlay font selects with installed fonts
  // and a notice for a missing one.
  function createSelectControls(deps) {
    const {
      tabsRow,
      getMessage,
      overlayFontMissing,
      overlayFontFallbackMissing,
      formatTemplate
    } = deps;

    // The page state object shared with options.js and the other modules.
    const optionsState = deps.optionsState;

    const optionsSelectControlApi = globalThis.LumnoOptionsSelectControl;
    const optionsSelectControlRecords = new Map();
    function readOptionsSelectItems(select) {
      return Array.from(select.options).map((option) => {
        const iconPath = option.getAttribute('data-icon-path') || '';
        return {
          badge: option.getAttribute('data-badge') || '',
          fallback: option.textContent || option.value,
          fontFamily: option.getAttribute('data-font-family') || '',
          iconUrl: iconPath && chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function'
            ? chrome.runtime.getURL(iconPath)
            : (iconPath ? `../../${iconPath}` : ''),
          labelKey: option.getAttribute('data-i18n') || '',
          value: option.value
        };
      });
    }
    function registerOptionsSelectControl(select, kind) {
      if (!select) {
        return null;
      }
      const host = select.closest('._x_extension_custom_select_2024_unique_');
      if (!host) {
        return null;
      }
      const items = readOptionsSelectItems(select);
      // The setting title plus the current value name the trigger for assistive tech.
      const title = host.closest('._x_extension_setting_row_2024_unique_')
        ?.querySelector('._x_extension_setting_title_2024_unique_');
      if (title && !title.id) {
        title.id = `${select.id}_title`;
      }
      const controller = optionsSelectControlApi.createSelectControlController(host, {
        getViewportTopInset() {
          // The settings tabs stay pinned at the top; a menu that flips upward must clear them.
          const tabsRect = tabsRow ? tabsRow.getBoundingClientRect() : null;
          return tabsRect ? Math.max(0, tabsRect.bottom + 8) : 8;
        },
        kind,
        onSelect(next) {
          select.value = next;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        },
        // Long lists (the installed fonts) get a filter field in the menu.
        searchable: host.getAttribute('data-select-searchable') === 'true'
      });
      const record = {
        controller,
        emptyLabelKey: host.getAttribute('data-select-empty-key') || '',
        items,
        labelledBy: title ? title.id : '',
        searchPlaceholderKey: host.getAttribute('data-select-search-placeholder-key') || '',
        select
      };
      optionsSelectControlRecords.set(select, record);
      return record;
    }
    // Options populated after registration (installed fonts load asynchronously)
    // need their snapshot rebuilt, or the menu keeps showing the old list.
    function refreshOptionsSelectItems(select) {
      const record = optionsSelectControlRecords.get(select);
      if (!record) {
        return;
      }
      record.items = readOptionsSelectItems(select);
      renderOptionsSelectControl(select);
    }
    function renderOptionsSelectControl(select) {
      const record = optionsSelectControlRecords.get(select);
      if (!record) {
        return;
      }
      record.controller.render({
        disabled: Boolean(select.disabled),
        emptyLabel: record.emptyLabelKey ? getMessage(record.emptyLabelKey, '') : undefined,
        id: select.id,
        labelledBy: record.labelledBy || undefined,
        searchPlaceholder: record.searchPlaceholderKey
          ? getMessage(record.searchPlaceholderKey, '')
          : undefined,
        items: record.items.map((item) => ({
          badge: item.badge,
          fontFamily: item.fontFamily,
          iconUrl: item.iconUrl,
          label: item.labelKey ? getMessage(item.labelKey, item.fallback) : item.fallback,
          labelKey: item.labelKey,
          value: item.value
        })),
        value: select.value
      });
    }
    function setOptionsSelectState(select, value) {
      if (!select) {
        return;
      }
      select.value = String(value);
      renderOptionsSelectControl(select);
    }
    // Installed fonts are only listable from an extension page with the
    // fontSettings permission, which Firefox does not offer. Chrome does not
    // let fontSettings be optional, so it is granted at install (it carries no
    // install warning). The row stays visible but dimmed on Firefox
    // (data-browser-unsupported) with the reason.
    function getInstalledFontFamilies() {
      const fontSettings = chrome && chrome.fontSettings;
      if (!fontSettings || typeof fontSettings.getFontList !== 'function') {
        return Promise.resolve([]);
      }
      try {
        const result = fontSettings.getFontList();
        // Chrome 96+ returns a promise. Older builds still take a callback.
        if (result && typeof result.then === 'function') {
          return result.catch(() => []);
        }
      } catch (error) {
        return Promise.resolve([]);
      }
      return new Promise((resolve) => {
        try {
          fontSettings.getFontList((fonts) => {
            // Reading lastError keeps Chrome from logging an unchecked error.
            void chrome.runtime.lastError;
            resolve(Array.isArray(fonts) ? fonts : []);
          });
        } catch (error) {
          resolve([]);
        }
      });
    }
    function getOverlayFontLabel(family) {
      return (family && optionsState.currentOverlayFontLabels[family]) || family;
    }
    // A chosen face this device does not have (uninstalled since, or never
    // here): the overlay already falls back, and the row says which font is
    // missing with one button to put the default back.
    function renderOverlayFontMissingNotices() {
      [
        [overlayFontMissing, optionsState.currentOverlayFontFamily, 'settings_overlay_font_missing'],
        [overlayFontFallbackMissing, optionsState.currentOverlayFontFallback, 'settings_overlay_font_fallback_missing']
      ].forEach(([notice, family, messageKey]) => {
        if (!notice) {
          return;
        }
        const missing = Boolean(
          optionsState.installedOverlayFontFamilies && family && !optionsState.installedOverlayFontFamilies.has(family)
        );
        notice.hidden = !missing;
        const text = notice.querySelector('._x_extension_overlay_font_missing_text_2026_unique_');
        if (missing && text) {
          text.textContent = formatTemplate(getMessage(messageKey, ''), { font: getOverlayFontLabel(family) });
        }
      });
    }
    function ensureOverlayFontOption(select, family) {
      if (!select || !family) {
        return;
      }
      const existing = Array.from(select.options).find((option) => option.value === family);
      if (existing) {
        // A family kept from storage before the list loads takes its synced name
        // once that arrives.
        if (existing.getAttribute('data-font-unlisted') === 'true') {
          existing.textContent = getOverlayFontLabel(family);
        }
        return;
      }
      // A family synced from another device may not be installed here, and
      // before the first menu open the list is not read at all. Show it rather
      // than silently switching the reader to the default face.
      const option = document.createElement('option');
      option.value = family;
      option.textContent = getOverlayFontLabel(family);
      option.setAttribute('data-font-family', family);
      option.setAttribute('data-font-unlisted', 'true');
      select.appendChild(option);
    }
    function populateOverlayFontOptions(select, currentFamily, defaultLabelKey, fonts) {
      if (!select) {
        return;
      }
      const seen = new Set();
      const entries = [];
      (Array.isArray(fonts) ? fonts : []).forEach((font) => {
        const family = font && typeof font.fontId === 'string' ? font.fontId.trim() : '';
        const label = font && typeof font.displayName === 'string' ? font.displayName.trim() : '';
        if (!family || seen.has(family)) {
          return;
        }
        seen.add(family);
        entries.push([family, label || family]);
      });
      entries.sort((left, right) => left[1].localeCompare(right[1], undefined, { sensitivity: 'base' }));
      select.textContent = '';
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = getMessage(defaultLabelKey, '');
      defaultOption.setAttribute('data-i18n', defaultLabelKey);
      select.appendChild(defaultOption);
      entries.forEach(([family, label]) => {
        const option = document.createElement('option');
        option.value = family;
        option.textContent = label;
        // The menu previews each face with the face itself.
        option.setAttribute('data-font-family', family);
        select.appendChild(option);
      });
      ensureOverlayFontOption(select, currentFamily);
      select.value = currentFamily;
      refreshOptionsSelectItems(select);
    }

    return {
      optionsSelectControlRecords,
      registerOptionsSelectControl,
      refreshOptionsSelectItems,
      renderOptionsSelectControl,
      setOptionsSelectState,
      getInstalledFontFamilies,
      renderOverlayFontMissingNotices,
      ensureOverlayFontOption,
      populateOverlayFontOptions
    };
  }

  root.LumnoOptionsPageSelectControls = { createSelectControls };
})(globalThis);
