// The search suggestion the arrow keys land on, shown in the input as the
// browser's address bar does. What was typed comes back when the selection
// leaves the suggestion, on Escape, or when the list drops the selection;
// typing on (or Tab) keeps the suggestion as the typed text instead.

// The input, or a test double.
interface PreviewInput {
  value: string;
  setSelectionRange(start: number, end: number): void;
}

// A row of the list; only search engine suggestions are written in.
interface PreviewSuggestion {
  type?: string;
  searchQuery?: string;
}

// The query a row puts in the input, or '' for a row that keeps what was
// typed (pages, tabs, commands, the search action itself).
function getSuggestionInputText(suggestion: PreviewSuggestion | null | undefined): string {
  if (!suggestion || suggestion.type !== 'googleSuggest') {
    return '';
  }
  return String(suggestion.searchQuery || '');
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

  return { show, restore, commit, isActive };
}

type SuggestionInputPreview = ReturnType<typeof createSuggestionInputPreview>;

export type { PreviewInput, PreviewSuggestion, SuggestionInputPreview };
export { createSuggestionInputPreview, getSuggestionInputText };
