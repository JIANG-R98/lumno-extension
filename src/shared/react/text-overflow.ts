export interface TextOverflowOptions {
  horizontal?: boolean;
  vertical?: boolean;
}

// The element's sizes, or a stand-in with them.
type MeasuredElement = Partial<Pick<Element, 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth'>>;

function overflows(client: unknown, scroll: unknown): boolean {
  const clientSize = Number(client);
  const scrollSize = Number(scroll);
  return Number.isFinite(clientSize) && Number.isFinite(scrollSize) && clientSize > 0 && scrollSize > clientSize;
}

// Whether the element's text overflows it: horizontally by default, and
// vertically (clamped lines) when asked.
export function isElementTextTruncated(
  element: MeasuredElement | null | undefined,
  options?: TextOverflowOptions | null
): boolean {
  if (!element) {
    return false;
  }
  const config = options || {};
  return (config.horizontal !== false && overflows(element.clientWidth, element.scrollWidth)) ||
    (config.vertical === true && overflows(element.clientHeight, element.scrollHeight));
}
