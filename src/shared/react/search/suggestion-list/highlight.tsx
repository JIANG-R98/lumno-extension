// Highlighting the query in titles and URLs, and the tooltip a row shows for
// its truncated text.
import { useSyncExternalStore } from 'react';
import type { NormalizedOptions, Suggestion, QueryStore } from './types';
import { surfaceClass } from './surface-options';
import { isElementTextTruncated } from '../../text-overflow';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getHighlightNeedles(query: string): string[] {
  const fullQuery = String(query || '').trim();
  if (!fullQuery) {
    return [];
  }
  const needles = [
    fullQuery,
    ...fullQuery.split(/[^\p{L}\p{M}\p{N}]+/u)
  ];
  const seen = new Set<string>();
  return needles
    .map((needle) => needle.trim())
    .filter((needle) => {
      const key = needle.toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.length - left.length);
}

// A term of one or two letters or digits from a script that writes words
// apart and has letter case matches only where a word starts ("ai" in
// OpenAI, not in "detail"; "да" not inside "когда"), so it is only marked
// there. The same rule as the search matcher.
const SHORT_WORD_TERM_PATTERN = /^[\p{sc=Latn}\p{sc=Cyrl}\p{sc=Grek}\p{sc=Armn}\p{sc=Geor}\d]{1,2}$/u;

function isHighlightWordStart(text: string, index: number): boolean {
  const previous = text.charAt(index - 1);
  const current = text.charAt(index);
  return !/[\p{L}\p{N}]/u.test(previous) ||
    /\d/.test(previous) !== /\d/.test(current) ||
    (/\p{Ll}/u.test(previous) && /\p{Lu}/u.test(current));
}

// The background marks a local result's title by the rules that matched it,
// pinyin and initials included. Its ranges only fit the text and query they
// were computed for; anywhere else, and while a newer query waits for
// results, the view marks the typed text.
export function getHighlightedParts(
  options: NormalizedOptions,
  text: unknown,
  query: string,
  highlight?: Suggestion['titleHighlight']
): Array<{ text: string; highlighted: boolean }> {
  const safeText = options.sanitizeDisplayText(text);
  let ranges: Array<[number, number]> = [];
  if (
    highlight?.text === safeText &&
    highlight.query === query.trim().toLowerCase()
  ) {
    ranges = highlight.ranges;
  } else {
    const needles = getHighlightNeedles(query);
    if (needles.length > 0) {
      const pattern = new RegExp(needles.map(escapeRegExp).join('|'), 'gi');
      for (const match of safeText.matchAll(pattern)) {
        const start = match.index || 0;
        if (!SHORT_WORD_TERM_PATTERN.test(match[0]) || isHighlightWordStart(safeText, start)) {
          ranges.push([start, start + match[0].length]);
        }
      }
    }
  }
  const parts: Array<{ text: string; highlighted: boolean }> = [];
  let offset = 0;
  ranges.forEach(([start, end]) => {
    if (start >= offset) {
      parts.push(
        { text: safeText.slice(offset, start), highlighted: false },
        { text: safeText.slice(start, end), highlighted: true }
      );
      offset = end;
    }
  });
  parts.push({ text: safeText.slice(offset), highlighted: false });
  return parts.filter((part) => part.text);
}

export function HighlightedText({
  options,
  text,
  queryStore,
  simpleMode,
  highlight
}: {
  options: NormalizedOptions;
  text: unknown;
  queryStore: QueryStore;
  simpleMode: boolean;
  highlight?: Suggestion['titleHighlight'];
}) {
  const query = useSyncExternalStore(
    queryStore.subscribe,
    queryStore.getSnapshot,
    queryStore.getSnapshot
  );
  if (simpleMode) {
    return options.sanitizeDisplayText(text);
  }
  return getHighlightedParts(options, text, query, highlight).map((part, index) =>
    part.highlighted ? (
      <mark
        key={`highlight:${index}`}
        className={surfaceClass(options, 'x-nt-suggestion-mark')}
      >
        {part.text}
      </mark>
    ) : (
      part.text
    )
  );
}

// A line of a result row whose text may be cut short.
export interface RowTooltipLine {
  getElement(): HTMLElement | null;
  // The full text the tooltip shows; the line's own text when left out.
  getText?(): unknown;
}

function getTruncatedText(
  options: NormalizedOptions,
  line: RowTooltipLine
): string {
  const element = line.getElement();
  if (!element || !isElementTextTruncated(element)) {
    return '';
  }
  return options.sanitizeDisplayText(
    line.getText ? line.getText() : element.textContent
  );
}

// The row shows the text it cut short from anywhere on it: the title, or the
// line under it when only that one is cut. With both cut, the title comes
// first and the line under it shows its own text where the pointer is on it.
// A utility button shows its own tooltip instead.
export function bindRowTooltip(
  options: NormalizedOptions,
  row: HTMLElement | null,
  title: RowTooltipLine,
  detail?: RowTooltipLine
): void {
  if (!options.bindCursorTooltip || !row) {
    return;
  }
  const utilityButtonSelector = `.${surfaceClass(options, 'x-nt-suggestion-utility-button')}`;
  // Focus and modifier key refreshes carry no target, so the element the
  // pointer was last on stands in for it.
  let pointed: Element | null = null;
  const resolveText = (inputEvent?: { target?: EventTarget | null } | null): string => {
    const eventTarget = inputEvent?.target;
    if (eventTarget instanceof Element) {
      pointed = eventTarget;
    }
    if (pointed?.closest(utilityButtonSelector)) {
      return '';
    }
    const titleText = getTruncatedText(options, title);
    const detailText = detail ? getTruncatedText(options, detail) : '';
    const onDetail = Boolean(pointed && detail?.getElement()?.contains(pointed));
    return detailText && (!titleText || onDetail) ? detailText : titleText;
  };
  options.bindCursorTooltip(row, (_target, inputEvent) => resolveText(inputEvent), {
    maxWidth: 520,
    shouldShow: (_target, inputEvent) => Boolean(resolveText(inputEvent)),
    deferHideVisibility: true,
    preserveVisibleOnTargetSwitch: true
  });
}
