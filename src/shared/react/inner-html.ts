// React sets an element's innerHTML again whenever the object passed as
// dangerouslySetInnerHTML is a new one, even for the same markup, which
// replaces the nodes inside (and replays their entry motion). One object
// per markup keeps unchanged content in place across renders.

const MAX_ENTRIES = 512;
const cache = new Map<string, { __html: string }>();

export function innerHtml(markup: string): { __html: string } {
  let entry = cache.get(markup);
  if (!entry) {
    if (cache.size >= MAX_ENTRIES) {
      cache.clear();
    }
    entry = { __html: markup };
    cache.set(markup, entry);
  }
  return entry;
}
