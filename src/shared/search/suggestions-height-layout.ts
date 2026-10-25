const HEIGHT_LAYOUT_ATTRIBUTES = Object.freeze([
  'data-height-clipped',
  'data-input-height-locked',
  'data-resizing'
]);
const HEIGHT_LAYOUT_PROPERTIES = Object.freeze([
  'flex',
  'height',
  'overflow',
  'overflow-x',
  'overflow-y',
  'padding-top',
  'padding-bottom',
  'transition',
  'will-change'
]);

// The suggestions container, or a test double with the members used here.
interface HeightLayoutTarget {
  style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>;
  removeAttribute(name: string): void;
}

// Drops the height animation state so the list takes its natural height at
// once; false when there is no container to change.
function applyNaturalSuggestionsHeightLayout(container: HeightLayoutTarget | null | undefined): boolean {
  if (!container) {
    return false;
  }
  HEIGHT_LAYOUT_ATTRIBUTES.forEach((attribute) => {
    container.removeAttribute(attribute);
  });
  HEIGHT_LAYOUT_PROPERTIES.forEach((property) => {
    container.style.removeProperty(property);
  });
  container.style.setProperty('transition', 'none', 'important');
  return true;
}

export type { HeightLayoutTarget };
export { applyNaturalSuggestionsHeightLayout };
