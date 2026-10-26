// The search suggestion the arrow keys land on, shown in the input as the
// browser's address bar does. What was typed comes back when the selection
// leaves the suggestion, on Escape, or when the list drops the selection;
// typing on (or Tab) keeps the suggestion as the typed text instead. Tab on
// a selected page puts its address in the input to edit.

// The input, or a test double.
interface PreviewInput {
  value: string;
  setSelectionRange(start: number, end: number): void;
}

// A row of the list; only search engine suggestions are written in.
interface PreviewSuggestion {
  type?: string;
  searchQuery?: string;
  url?: string;
}

// Rows that open a page whose address Tab can take.
const PAGE_ROW_TYPES = new Set(['history', 'bookmark', 'topSite', 'browserPage']);

// The query a row puts in the input, or '' for a row that keeps what was
// typed (pages, tabs, commands, the search action itself).
function getSuggestionInputText(suggestion: PreviewSuggestion | null | undefined): string {
  if (!suggestion || suggestion.type !== 'googleSuggest') {
    return '';
  }
  return String(suggestion.searchQuery || '');
}

// The address a page row puts in the input on Tab, as one would type it:
// https:// and a lone trailing slash dropped, http:// and ports kept. ''
// for rows that are not pages.
function getSuggestionEditText(suggestion: PreviewSuggestion | null | undefined): string {
  if (!suggestion || !PAGE_ROW_TYPES.has(String(suggestion.type))) {
    return '';
  }
  const url = String(suggestion.url || '').trim();
  if (!/^https:\/\//i.test(url)) {
    return url;
  }
  const address = url.slice('https://'.length);
  const slash = address.indexOf('/');
  return slash === address.length - 1 ? address.slice(0, -1) : address;
}

function setInputValue(input: PreviewInput, value: string): void {
  if (input.value === value) {
    return;
  }
  input.value = value;
  input.setSelectionRange(value.length, value.length);
}

function createSuggestionInputPreview() {
  let active = false;

  // Writes the selected row's query into the input, or puts the typed text
  // back for a row without one.
  function show(input: PreviewInput | null, suggestion: PreviewSuggestion | null | undefined, typedValue: string): void {
    const text = getSuggestionInputText(suggestion);
    if (!text) {
      restore(input, typedValue);
      return;
    }
    if (input) {
      setInputValue(input, text);
      active = true;
    }
  }

  // Puts the typed text back; true when a suggestion was showing.
  function restore(input: PreviewInput | null, typedValue: string): boolean {
    if (!active) {
      return false;
    }
    active = false;
    if (input) {
      setInputValue(input, String(typedValue || ''));
    }
    return true;
  }

  // The shown suggestion becomes the typed text; true when one was showing.
  function commit(): boolean {
    const wasActive = active;
    active = false;
    return wasActive;
  }

  function isActive(): boolean {
    return active;
  }

  // Puts a selected page's address in the input to edit; true when the row
  // has one.
  function editAddress(input: PreviewInput | null, suggestion: PreviewSuggestion | null | undefined): boolean {
    const text = getSuggestionEditText(suggestion);
    if (!input || !text) {
      return false;
    }
    active = false;
    setInputValue(input, text);
    return true;
  }

  return { show, restore, commit, isActive, editAddress };
}

type SuggestionInputPreview = ReturnType<typeof createSuggestionInputPreview>;

export type { PreviewInput, PreviewSuggestion, SuggestionInputPreview };
export { createSuggestionInputPreview, getSuggestionEditText, getSuggestionInputText };
