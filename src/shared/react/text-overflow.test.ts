import { describe, expect, it } from 'vitest';
import { isElementTextTruncated } from './text-overflow';

function createMeasuredElement(
  dimensions: Partial<Pick<HTMLElement, 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth'>>
): HTMLElement {
  return dimensions as HTMLElement;
}

describe('text overflow', () => {
  it('treats a one-pixel width difference as truncated', () => {
    expect(isElementTextTruncated(createMeasuredElement({
      clientWidth: 48,
      scrollWidth: 49
    }))).toBe(true);
    expect(isElementTextTruncated(createMeasuredElement({
      clientWidth: 48,
      scrollWidth: 48
    }))).toBe(false);
  });

  it('checks clamped vertical text only when requested', () => {
    const element = createMeasuredElement({
      clientHeight: 32,
      clientWidth: 120,
      scrollHeight: 33,
      scrollWidth: 120
    });
    expect(isElementTextTruncated(element)).toBe(false);
    expect(isElementTextTruncated(element, { vertical: true })).toBe(true);
  });
});
