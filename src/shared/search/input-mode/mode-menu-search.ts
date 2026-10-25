// Filtering the mode menu: the search text and Han readings of each item,
// matching a query, and the highlighted label.
import * as LumnoSearchUtils from '../../../domain/search/search-utils';
import type * as LumnoCursorTooltip from '../../ui/cursor-tooltip';
import type { CursorTooltipController } from '../../ui/cursor-tooltip';
import type { ModeMenuEntry, ModeMenuItem, ModeMenuMatch, ModeMenuRange, ModeMenuSearchIndex } from './types';

// pinyin-pro, once loaded.
interface PinyinApi {
  pinyin?(text: string, options: { toneType: 'none'; type: 'array'; multiple: true; v: true }): unknown;
}

interface ModeMenuSearchDeps {
  getModeMenuPinyinApi: () => PinyinApi | null | undefined;
  // Readings of common characters in built-in scope names, before pinyin-pro loads.
  MODE_MENU_PINYIN_FALLBACKS: Readonly<Record<string, string>>;
  doc: Document;
  modeMenuCursorTooltipController: Pick<CursorTooltipController, 'bind'> | null;
  cursorTooltipApi: Pick<typeof LumnoCursorTooltip, 'isElementTextTruncated'>;
  modeMenu: HTMLElement;
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function createModeMenuSearch(deps: ModeMenuSearchDeps) {
  const {
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
  function normalizeModeMenuSearchText(value: unknown): string {
    return LumnoSearchUtils.compactSearchQuery(value);
  }

  function appendModeMenuSearchSequence(
    sequence: string[],
    characterMap: Readonly<ModeMenuRange>[],
    value: string,
    range: Readonly<ModeMenuRange>
  ): void {
    const normalized = normalizeModeMenuSearchText(value);
    Array.from(normalized).forEach((character) => {
      sequence.push(character);
      characterMap.push(range);
    });
  }

  // Every reading of each character once pinyin-pro is in; until then the
  // built-in scope names still spell from the fallback table.
  function getModeMenuHanReadings(_text: string, characters: string[]): unknown[][] {
    const pinyinApi = getModeMenuPinyinApi();
    return characters.map((character): unknown[] => {
      const fallback = hasOwn(MODE_MENU_PINYIN_FALLBACKS, character) ? MODE_MENU_PINYIN_FALLBACKS[character] : '';
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
        const readings: unknown[] = Array.isArray(result) ? result : [result];
        return readings.filter(Boolean).length > 0 ? readings : (fallback ? [fallback] : []);
      } catch (_error) {
        return fallback ? [fallback] : [];
      }
    });
  }

  function buildModeMenuSearchIndex(item: ModeMenuItem | null | undefined): Readonly<ModeMenuSearchIndex> {
    const labelText = String(item && item.label ? item.label : '');
    const labelSequence: string[] = [];
    const labelMap: Readonly<ModeMenuRange>[] = [];
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
    const provider = item && item.provider ? item.provider : null;
    const searchTerms = [
      ...(item && Array.isArray(item.searchTerms) ? item.searchTerms : []),
      ...(provider ? [provider.key, provider.name] : []),
      ...(provider && Array.isArray(provider.aliases) ? provider.aliases : [])
    ]
      .map(normalizeModeMenuSearchText)
      .filter(Boolean);
    return Object.freeze({
      label: labelSequence.join(''),
      labelMap,
      // Pinyin, initials and mixed spellings ("db", "douban", "doub"), by the
      // same rules as the search results.
      units: LumnoSearchUtils.buildSearchTextIndex(labelText, { getHanReadings: getModeMenuHanReadings }),
      searchTerms
    });
  }

  function getModeMenuSearchRange(
    sequence: string,
    characterMap: Readonly<ModeMenuRange>[],
    query: string
  ): ModeMenuRange | null {
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

  function getModeMenuItemMatch(entry: ModeMenuEntry, normalizedQuery: string): ModeMenuMatch {
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
    const unitMatch = index.units
      ? LumnoSearchUtils.matchSearchTextIndex(index.units, normalizedQuery)
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

  function renderModeMenuLabelMatch(label: HTMLElement, labelText: string, ranges: ModeMenuRange[] | null | undefined): void {
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

  function createModeMenuLabel(labelText: string): HTMLSpanElement {
    const text = String(labelText || '');
    const label = doc.createElement('span');
    label.className = 'x-lumno-search-input-mode__menu-label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = text;
    return label;
  }

  // Shows the full label beside the pointer when the menu cut it short.
  function bindModeMenuLabelTooltip(button: HTMLElement, label: HTMLElement, labelText: string): void {
    if (!modeMenuCursorTooltipController) {
      return;
    }
    const updateTruncatedState = (): boolean => {
      const isTruncated = cursorTooltipApi.isElementTextTruncated(label);
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

type ModeMenuSearchApi = ReturnType<typeof createModeMenuSearch>;

export { createModeMenuSearch };
export type { ModeMenuSearchApi, ModeMenuSearchDeps, PinyinApi };
