export interface TextOverflowOptions {
  horizontal?: boolean;
  vertical?: boolean;
}

// The sizes the check reads, which any element has.
type MeasuredElement = Pick<HTMLElement, 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth'>;

export function isElementTextTruncated(
  element: MeasuredElement | null,
  options: TextOverflowOptions = {}
): boolean {
  if (!element) {
    return false;
  }
  const checkHorizontal = options.horizontal !== false;
  const checkVertical = options.vertical === true;
  return (
    checkHorizontal &&
    element.clientWidth > 0 &&
    element.scrollWidth > element.clientWidth
  ) || (
    checkVertical &&
    element.clientHeight > 0 &&
    element.scrollHeight > element.clientHeight
  );
}
