// Remix Icon markup: the icon font draws the glyph named by `id`.
function getRiSvg(id: string, sizeClass?: string, extraClass?: string): string {
  const size = sizeClass || 'ri-size-16';
  const extra = extraClass ? ` ${extraClass}` : '';
  return `<i class="ri-icon ${size}${extra} ${id}" aria-hidden="true"></i>`;
}

export { getRiSvg };
