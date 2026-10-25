// Types the overlay's panel modules share. Each module declares the slice of
// the panel state and the dependencies it uses; search-panel.ts passes one
// state object that has them all.

// Looks up a UI string in the panel's language, or the fallback.
type Translate = (key: string, fallback: string) => string;

// Translate with {name} placeholders filled in from values.
type FormatMessage = (key: string, fallback: string, values?: Record<string, string>) => string;

export type { FormatMessage, Translate };
