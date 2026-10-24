// @ts-nocheck
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

function applyNaturalSuggestionsHeightLayout(container) {
  if (!container || !container.style) {
    return false;
  }
  if (typeof container.removeAttribute === 'function') {
    HEIGHT_LAYOUT_ATTRIBUTES.forEach((attribute) => {
      container.removeAttribute(attribute);
    });
  }
  if (typeof container.style.removeProperty === 'function') {
    HEIGHT_LAYOUT_PROPERTIES.forEach((property) => {
      container.style.removeProperty(property);
    });
  }
  if (typeof container.style.setProperty === 'function') {
    container.style.setProperty('transition', 'none', 'important');
  }
  return true;
}

export { applyNaturalSuggestionsHeightLayout };
