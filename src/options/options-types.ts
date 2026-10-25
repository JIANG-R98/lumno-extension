// Types the options page shares with the modules split out of it.

// A message by key from the language the page shows; fallback when the
// language has no such message.
type GetMessage = (key: string, fallback: string) => string;

// The text with each {name} replaced by params[name]; unknown names stay.
type FormatTemplate = (text: string, params: Record<string, string | number>) => string;

export type { FormatTemplate, GetMessage };
