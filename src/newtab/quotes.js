(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LumnoNewtabQuotes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';
  function createRuntime(options) {
    const config = options || {};
    const document = config.documentObj || root.document;
    const window = config.windowObj || root.window;
    const settings = root.LumnoSettings;
    const key = settings.NEWTAB_QUOTE_PREFS_STORAGE_KEY;
    const t = config.t;
    // Hitokoto only serves Chinese text, so the quote exists for Chinese UI languages only.
    const isLocaleSupported = () => !config.getLocale || /^zh_(CN|TW)$/.test(config.getLocale() || '');
    const client = config.client || root.LumnoNewtabRemoteContent.createClient({
      storageArea: config.localStorageArea,
      fallbackQuote: () => ({
        text: t('newtab_quote_fallback_text', 'A journey of a thousand miles begins with a single step.'),
        author: t('newtab_quote_fallback_author', 'Laozi'),
        source: t('newtab_quote_fallback_source', 'Tao Te Ching'),
        url: 'https://hitokoto.cn/'
      })
    });
    const element = document.createElement('div');
    element.className = 'x-nt-quote';
    element.hidden = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'x-nt-quote-text';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'lumno-quote-attribution');
    const attribution = document.createElement('div');
    attribution.className = 'x-nt-quote-attribution';
    attribution.id = 'lumno-quote-attribution';
    const credit = document.createElement('span');
    const link = document.createElement('a');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    attribution.append(credit, link);
    element.append(button, attribution);
    let prefs = settings.normalizeNewtabQuotePrefs(null);
    let quote = null;
    let revision = 0;
    let refs;
    let settingsExpanded = true;
    let mounted = false;
    let dayTimer;
    let unsubscribe;
    let disposed = false;
    let draftFontSize = null;
    let localeSupported = isLocaleSupported();
    const isActive = () => prefs.enabled && localeSupported;
    const area = config.storageArea;
    function syncBottomHeight() {
      const height = !element.hidden && prefs.position === 'bottom'
        ? Math.ceil(element.getBoundingClientRect().height) : 0;
      document.body.style.setProperty('--x-nt-quote-bottom-height', `${height}px`);
    }
    const resizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(syncBottomHeight) : null;

    function syncFontSizeControls(forceValue) {
      if (!refs || !refs.quoteFontSizeSlider) return;
      const size = draftFontSize === null ? prefs.fontSize : draftFontSize;
      const min = settings.NEWTAB_QUOTE_FONT_SIZE_MIN;
      const max = settings.NEWTAB_QUOTE_FONT_SIZE_MAX;
      const label = t('newtab_quote_font_size_label', 'Quote font size (px)');
      refs.quoteFontSizeTitle.textContent = t('newtab_quote_font_size', 'Font size');
      refs.quoteFontSizeSlider.min = String(min);
      refs.quoteFontSizeSlider.max = String(max);
      refs.quoteFontSizeSlider.step = '1';
      refs.quoteFontSizeSlider.value = String(size);
      refs.quoteFontSizeSlider.setAttribute('aria-label', label);
      refs.quoteFontSizeSlider.style.setProperty('--x-range-slider-percent', `${(size - min) / (max - min) * 100}%`);
      const input = refs.quoteFontSizeSliderValueInput;
      input.min = String(min);
      input.max = String(max);
      input.step = '1';
      input.setAttribute('aria-label', label);
      if (forceValue || document.activeElement !== input) input.value = String(size);
    }

    function previewFontSize(value) {
      draftFontSize = settings.normalizeNewtabQuotePrefs({ ...prefs, fontSize: value }).fontSize;
      element.style.setProperty('--x-nt-quote-font-size', `${draftFontSize}px`);
      syncFontSizeControls(false);
      syncBottomHeight();
      if (config.onLayout) config.onLayout();
    }

    function commitFontSize(value) {
      const raw = String(value).trim();
      if (!raw || !Number.isFinite(Number(raw))) {
        draftFontSize = null;
        render();
      } else {
        const size = settings.normalizeNewtabQuotePrefs({ ...prefs, fontSize: raw }).fontSize;
        if (size !== prefs.fontSize) {
          draftFontSize = size;
          persist({ fontSize: size });
        }
        else {
          draftFontSize = null;
          render();
        }
      }
      syncFontSizeControls(true);
    }

    function labels() {
      return {
        input: t('newtab_quote_input', 'Below search box'),
        search: t('newtab_quote_search', 'Below shortcuts'),
        bottom: t('newtab_quote_bottom', 'Page bottom'),
        literature: t('newtab_quote_literature', 'Literature'),
        poetry: t('newtab_quote_poetry', 'Poetry')
      };
    }
    function updateSettings() {
      if (!refs) return;
      if (refs.quoteSection) refs.quoteSection.hidden = !localeSupported;
      if (refs.quoteDivider) refs.quoteDivider.hidden = !localeSupported;
      const text = labels();
      const title = t('newtab_quote_title', 'Daily quote');
      refs.quoteTitle.textContent = title;
      refs.quoteEnabledToggle.checked = prefs.enabled;
      refs.quoteEnabledToggle.setAttribute('aria-label', title);
      refs.quoteBody.hidden = !(prefs.enabled && settingsExpanded);
      if (refs.quoteAccordionTrigger) {
        refs.quoteAccordionTrigger.disabled = !prefs.enabled;
        refs.quoteAccordionTrigger.setAttribute('aria-disabled', prefs.enabled ? 'false' : 'true');
        refs.quoteAccordionTrigger.setAttribute(
          'aria-expanded',
          prefs.enabled && settingsExpanded ? 'true' : 'false'
        );
      }
      if (refs.quoteInfoButton) refs.quoteInfoButton.setAttribute('aria-label', t('newtab_quote_provider', 'Powered by Hitokoto'));
      refs.quotePosition.setAttribute('aria-label', t('newtab_quote_position', 'Quote position'));
      refs.quoteCategory.setAttribute('aria-label', t('newtab_quote_category', 'Quote category'));
      if (refs.quotePositionLabel) refs.quotePositionLabel.textContent = t('newtab_quote_position', 'Quote position');
      if (refs.quoteCategoryLabel) refs.quoteCategoryLabel.textContent = t('newtab_quote_category', 'Quote category');
      syncFontSizeControls(false);
      [refs.quotePosition, refs.quoteCategory].forEach((group) => {
        group.querySelectorAll('button').forEach((item) => {
          const value = item.getAttribute('data-quote-position') || item.getAttribute('data-quote-category');
          item.textContent = text[value];
          const selected = value === prefs.position || value === prefs.category;
          item.setAttribute('aria-pressed', selected ? 'true' : 'false');
          item.setAttribute('data-active', selected ? 'true' : 'false');
        });
        syncTabIndicator(group);
      });
    }
    // Tabs hug their labels, so the indicator follows the active button's measured box.
    function syncTabIndicator(group) {
      const segmentedIndicator = globalThis.LumnoSegmentedIndicator;
      if (segmentedIndicator) segmentedIndicator.sync(group.querySelector('.x-nt-segmented-tabs-indicator'));
    }
    const tabResizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver((entries) => entries.forEach((entry) => syncTabIndicator(entry.target)))
      : null;
    function updateText() {
      element.setAttribute('aria-label', t('newtab_quote_title', 'Daily quote'));
      link.textContent = t('newtab_quote_source', 'View on Hitokoto');
      if (quote) {
        button.textContent = quote.text;
        const origin = [quote.author, quote.source ? `《${quote.source}》` : ''].filter(Boolean).join(' · ');
        credit.textContent = origin;
        button.title = origin;
        button.setAttribute('aria-label', [quote.text, origin].filter(Boolean).join(' — '));
        link.href = /^https:\/\/hitokoto\.cn\//.test(quote.url || '') ? quote.url : 'https://hitokoto.cn/';
      }
      updateSettings();
    }
    function render() {
      if (!mounted || disposed) return;
      element.dataset.position = prefs.position;
      document.body.dataset.quotePosition = isActive() ? prefs.position : 'off';
      element.style.setProperty('--x-nt-quote-font-size', `${draftFontSize === null ? prefs.fontSize : draftFontSize}px`);
      element.hidden = !isActive() || !quote;
      if (prefs.position === 'input') {
        const anchor = config.getSearchRoot();
        anchor.parentNode.insertBefore(element, anchor.nextSibling);
      } else if (prefs.position === 'search') {
        const shortcuts = config.getShortcutSection && config.getShortcutSection();
        const anchor = shortcuts && shortcuts.parentNode ? shortcuts : config.getSearchRoot();
        anchor.parentNode.insertBefore(element, anchor.nextSibling);
      } else document.body.appendChild(element);
      updateText();
      syncBottomHeight();
      if (config.onLayout) config.onLayout();
    }
    async function refresh() {
      const current = ++revision;
      if (!isActive()) return render();
      const category = prefs.category;
      // Render the last successful response before making a network request.
      if (config.localStorageArea) {
        await new Promise((resolve) => config.localStorageArea.get(
          [root.LumnoNewtabRemoteContent.QUOTE_CACHE_KEY], (values) => {
            const cache = values && values[root.LumnoNewtabRemoteContent.QUOTE_CACHE_KEY];
            if (current === revision && cache && cache[category] && cache[category].quote) {
              quote = cache[category].quote;
              render();
            }
            resolve();
          }
        ));
      }
      const next = await client.getQuote(category);
      if (current !== revision || disposed || !isActive()) return;
      quote = next;
      render();
      window.clearTimeout(dayTimer);
      const tomorrow = new Date();
      tomorrow.setHours(24, 0, 1, 0);
      dayTimer = window.setTimeout(() => {
        if (document.visibilityState === 'visible') refresh();
      }, tomorrow.getTime() - Date.now());
    }
    function apply(value) {
      const next = settings.normalizeNewtabQuotePrefs(value);
      const changedCategory = next.category !== prefs.category;
      const activated = !isActive() && next.enabled && localeSupported;
      prefs = next;
      draftFontSize = null;
      if (changedCategory) quote = null;
      sync(changedCategory || activated);
    }
    function sync(shouldRefresh) {
      if (!isActive()) {
        revision += 1;
        window.clearTimeout(dayTimer);
      }
      render();
      updateSettings();
      if (shouldRefresh) refresh().catch(() => {});
    }
    function updateLanguage() {
      const supported = isLocaleSupported();
      if (supported === localeSupported) return updateText();
      localeSupported = supported;
      sync(mounted && supported && prefs.enabled);
    }
    function persist(change) {
      const next = settings.normalizeNewtabQuotePrefs({ ...prefs, ...change });
      if (!area) return;
      area.set({ [key]: next }, () => {
        const error = root.chrome && root.chrome.runtime && root.chrome.runtime.lastError;
        if (error) {
          draftFontSize = null;
          render();
          if (config.showToast) config.showToast(t('newtab_quote_save_error', 'Failed to save quote settings'), true);
        } else apply(next);
      });
    }
    function handleStorageChange(changes, areaName) {
      if (disposed) return;
      if (changes[key] && (!config.isPreferenceArea || config.isPreferenceArea(areaName))) apply(changes[key].newValue);
      if (areaName === 'local' && changes[root.LumnoNewtabRemoteContent.QUOTE_CACHE_KEY]) {
        const cache = changes[root.LumnoNewtabRemoteContent.QUOTE_CACHE_KEY].newValue;
        if (cache && cache[prefs.category] && cache[prefs.category].quote) {
          quote = cache[prefs.category].quote;
          render();
        }
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isActive()) refresh().catch(() => {});
    };
    button.addEventListener('click', () => {
      delete element.dataset.dismissed;
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(expanded));
      element.dataset.expanded = String(expanded);
    });
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        element.dataset.expanded = 'false';
        button.setAttribute('aria-expanded', 'false');
        button.focus();
        element.dataset.dismissed = 'true';
      }
    });
    element.addEventListener('pointerenter', () => { delete element.dataset.dismissed; });
    element.addEventListener('focusin', () => { delete element.dataset.dismissed; });
    const onPointerDown = (event) => {
      if (!element.contains(event.target)) {
        element.dataset.expanded = 'false';
        button.setAttribute('aria-expanded', 'false');
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    function bindSettings(nextRefs) {
      refs = nextRefs;
      if (!refs.quotePosition || !refs.quoteCategory) return;
      refs.quoteEnabledToggle.addEventListener('change', () => persist({ enabled: refs.quoteEnabledToggle.checked }));
      if (refs.quoteAccordionTrigger) {
        refs.quoteAccordionTrigger.addEventListener('click', () => {
          if (!prefs.enabled) return;
          settingsExpanded = !settingsExpanded;
          updateSettings();
        });
      }
      refs.quotePosition.querySelectorAll('[data-quote-position]').forEach((item) => {
        item.addEventListener('click', () => persist({ position: item.dataset.quotePosition }));
      });
      refs.quoteCategory.querySelectorAll('[data-quote-category]').forEach((item) => {
        item.addEventListener('click', () => persist({ category: item.dataset.quoteCategory }));
      });
      if (tabResizeObserver) {
        // Re-measure once the collapsed panel lays out, and when translated labels change width.
        tabResizeObserver.observe(refs.quotePosition);
        tabResizeObserver.observe(refs.quoteCategory);
      }
      if (refs.quoteFontSizeSlider) {
        const slider = refs.quoteFontSizeSlider;
        const input = refs.quoteFontSizeSliderValueInput;
        slider.addEventListener('input', () => previewFontSize(slider.value));
        slider.addEventListener('change', () => commitFontSize(slider.value));
        input.addEventListener('input', () => {
          if (input.value.trim() && Number.isFinite(Number(input.value))) previewFontSize(input.value);
        });
        input.addEventListener('blur', () => commitFontSize(input.value));
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
          }
        });
      }
      updateSettings();
    }
    function mount() {
      mounted = true;
      render();
      if (resizeObserver) resizeObserver.observe(element);
      document.addEventListener('visibilitychange', onVisibility);
      const onChanged = config.chromeObj && config.chromeObj.storage && config.chromeObj.storage.onChanged;
      if (onChanged) {
        onChanged.addListener(handleStorageChange);
        unsubscribe = () => onChanged.removeListener(handleStorageChange);
      }
      return new Promise((resolve) => {
        if (!area) return resolve();
        area.get([key], (values) => {
          if (!disposed) apply(values && values[key]);
          resolve();
        });
      });
    }
    return Object.freeze({ element, mount, bindSettings, updateLanguage,
      destroy() {
        disposed = true;
        revision += 1;
        window.clearTimeout(dayTimer);
        if (resizeObserver) resizeObserver.disconnect();
        if (tabResizeObserver) tabResizeObserver.disconnect();
        if (unsubscribe) unsubscribe();
        document.removeEventListener('visibilitychange', onVisibility);
        document.removeEventListener('pointerdown', onPointerDown);
        element.remove();
      } });
  }
  return Object.freeze({ createRuntime });
});
