(function(root) {
  'use strict';

  // Filtering the mode menu: the search text and Han readings of each item,
  // matching a query, and the highlighted label.
  function createModeMenuSearch(deps) {
    const {
      root,
      getModeMenuPinyinApi,
      MODE_MENU_PINYIN_FALLBACKS,
      doc,
      modeMenuCursorTooltipController,
      cursorTooltipApi,
      modeMenu
    } = deps;

    // The panel reads names and the typed filter by the same rules as the
    // search results: kana, Hangul and Cyrillic included, accents and
    // full-width forms folded.
    function normalizeModeMenuSearchText(value) {
      const searchUtils = getModeMenuSearchUtils();
      if (searchUtils && typeof searchUtils.compactSearchQuery === 'function') {
        return searchUtils.compactSearchQuery(value);
      }
      return String(value || '').normalize('NFKD').toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
    }

    function appendModeMenuSearchSequence(sequence, characterMap, value, range) {
      const normalized = normalizeModeMenuSearchText(value);
      Array.from(normalized).forEach((character) => {
        sequence.push(character);
        characterMap.push(range);
      });
    }

    function getModeMenuSearchUtils() {
      const searchUtils = root.LumnoSearchUtils || (
        typeof globalThis !== 'undefined' ? globalThis.LumnoSearchUtils : null
      );
      return searchUtils && typeof searchUtils.buildSearchTextIndex === 'function' &&
        typeof searchUtils.matchSearchTextIndex === 'function'
        ? searchUtils
        : null;
    }

    // Every reading of each character once pinyin-pro is in; until then the
    // built-in scope names still spell from the fallback table.
    function getModeMenuHanReadings(text, characters) {
      const pinyinApi = getModeMenuPinyinApi();
      return characters.map((character) => {
        const fallback = MODE_MENU_PINYIN_FALLBACKS[character];
        if (!pinyinApi || typeof pinyinApi.pinyin !== 'function') {
          return fallback ? [fallback] : [];
        }
        try {
          const result = pinyinApi.pinyin(character, {
            toneType: 'none',
            type: 'array',
            multiple: true,
            v: true
          });
          const readings = Array.isArray(result) ? result : [result];
          return readings.filter(Boolean).length > 0 ? readings : (fallback ? [fallback] : []);
        } catch (error) {
          return fallback ? [fallback] : [];
        }
      });
    }

    function buildModeMenuSearchIndex(item) {
      const labelText = String(item && item.label ? item.label : '');
      const labelSequence = [];
      const labelMap = [];
      let sourceOffset = 0;
      Array.from(labelText).forEach((character) => {
        const start = sourceOffset;
        sourceOffset += character.length;
        appendModeMenuSearchSequence(
          labelSequence,
          labelMap,
          character,
          Object.freeze({ start, end: sourceOffset })
        );
      });
      const searchUtils = getModeMenuSearchUtils();
      const provider = item && item.provider ? item.provider : null;
      const searchTerms = []
        .concat(Array.isArray(item && item.searchTerms) ? item.searchTerms : [])
        .concat(provider ? [provider.key, provider.name] : [])
        .concat(provider && Array.isArray(provider.aliases) ? provider.aliases : [])
        .map(normalizeModeMenuSearchText)
        .filter(Boolean);
      return Object.freeze({
        label: labelSequence.join(''),
        labelMap,
        // Pinyin, initials and mixed spellings ("db", "douban", "doub"), by the
        // same rules as the search results.
        units: searchUtils
          ? searchUtils.buildSearchTextIndex(labelText, { getHanReadings: getModeMenuHanReadings })
          : null,
        searchTerms
      });
    }

    function getModeMenuSearchRange(sequence, characterMap, query) {
      const startIndex = sequence.indexOf(query);
      if (startIndex < 0 || !characterMap[startIndex]) {
        return null;
      }
      const lastRange = characterMap[startIndex + query.length - 1];
      if (!lastRange) {
        return null;
      }
      return {
        start: characterMap[startIndex].start,
        end: lastRange.end
      };
    }

    function getModeMenuItemMatch(entry, normalizedQuery) {
      if (!normalizedQuery) {
        return { matched: true, ranges: [] };
      }
      const index = entry.searchIndex;
      const directRange = getModeMenuSearchRange(
        index.label,
        index.labelMap,
        normalizedQuery
      );
      if (directRange) {
        return { matched: true, ranges: [directRange] };
      }
      const searchUtils = getModeMenuSearchUtils();
      const unitMatch = searchUtils && index.units
        ? searchUtils.matchSearchTextIndex(index.units, normalizedQuery)
        : null;
      if (unitMatch) {
        return {
          matched: true,
          ranges: unitMatch.ranges.map((range) => ({ start: range[0], end: range[1] }))
        };
      }
      const matchedSearchTerm = index.searchTerms.some((term) => (
        term.includes(normalizedQuery)
      ));
      if (matchedSearchTerm) {
        return {
          matched: true,
          ranges: entry.labelText ? [{ start: 0, end: entry.labelText.length }] : []
        };
      }
      return { matched: false, ranges: [] };
    }

    function renderModeMenuLabelMatch(label, labelText, ranges) {
      while (label.firstChild) {
        label.removeChild(label.firstChild);
      }
      const normalizedRanges = (Array.isArray(ranges) ? ranges : [])
        .map((range) => ({
          start: Math.max(0, Number(range && range.start) || 0),
          end: Math.min(labelText.length, Number(range && range.end) || 0)
        }))
        .filter((range) => range.end > range.start)
        .sort((left, right) => left.start - right.start);
      if (normalizedRanges.length === 0) {
        label.textContent = labelText;
        return;
      }
      let offset = 0;
      normalizedRanges.forEach((range) => {
        if (range.start > offset) {
          label.appendChild(doc.createTextNode(labelText.slice(offset, range.start)));
        }
        const mark = doc.createElement('mark');
        mark.className = 'x-lumno-search-input-mode__menu-match';
        mark.textContent = labelText.slice(range.start, range.end);
        label.appendChild(mark);
        offset = range.end;
      });
      if (offset < labelText.length) {
        label.appendChild(doc.createTextNode(labelText.slice(offset)));
      }
    }

    function createModeMenuLabel(labelText) {
      const text = String(labelText || '');
      const label = doc.createElement('span');
      label.className = 'x-lumno-search-input-mode__menu-label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = text;
      return label;
    }

    function bindModeMenuLabelTooltip(button, label, labelText) {
      if (!modeMenuCursorTooltipController ||
          typeof modeMenuCursorTooltipController.bind !== 'function') {
        return;
      }
      const updateTruncatedState = () => {
        const isTruncated = typeof cursorTooltipApi.isElementTextTruncated === 'function'
          ? cursorTooltipApi.isElementTextTruncated(label)
          : Number(label.clientWidth) > 0 &&
            Number(label.scrollWidth) > Number(label.clientWidth);
        button.setAttribute('data-label-truncated', isTruncated ? 'true' : 'false');
        return isTruncated;
      };
      modeMenuCursorTooltipController.bind(button, () => String(labelText || ''), {
        maxWidth: 320,
        shouldShow: updateTruncatedState,
        deferHideVisibility: true,
        preserveVisibleOnTargetSwitch: true,
        handoffRoot: modeMenu
      });
    }

    return {
      normalizeModeMenuSearchText,
      buildModeMenuSearchIndex,
      getModeMenuItemMatch,
      renderModeMenuLabelMatch,
      createModeMenuLabel,
      bindModeMenuLabelTooltip
    };
  }

  const api = Object.freeze({ createModeMenuSearch });
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchInputModeModeMenuSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
