import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REMIX_ICON_NAMES,
  REMIX_ICON_SIZES,
  createRemixIconElement,
  getRemixIconClassName,
  isRemixIconName,
  readRemixIconName
} from './remix-icon';

const ROOT = process.cwd();

function listFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

describe('Remix icons', () => {
  it('names only glyphs the bundled font draws', () => {
    const fontCss = readFileSync(join(ROOT, 'assets/remixicon/fonts/remixicon.css'), 'utf8');
    const missing = REMIX_ICON_NAMES.filter((name) => !fontCss.includes(`.${name}:before`));
    expect(missing).toEqual([]);
  });

  it('defines every size wherever a stylesheet sizes icons', () => {
    const sheets = listFiles('src').filter((path) => /\.(?:css|tsx)$/.test(path) && !path.includes('.test.'));
    const sizing = sheets
      .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }))
      .filter(({ text }) => /\.ri-size-\d+\s*\{/.test(text));
    expect(sizing.length).toBeGreaterThan(0);
    sizing.forEach(({ path, text }) => {
      const defined = Array.from(text.matchAll(/\.ri-size-(\d+)\s*\{/g), (match) => Number(match[1]));
      expect({ path, sizes: [...new Set(defined)].sort((a, b) => a - b) }).toEqual({ path, sizes: [...REMIX_ICON_SIZES] });
    });
  });

  it('builds the class list the styles expect', () => {
    expect(getRemixIconClassName({ name: 'ri-link' })).toBe('ri-icon ri-link');
    expect(getRemixIconClassName({ name: 'ri-close-line', size: 12, className: 'is-muted' }))
      .toBe('ri-icon ri-size-12 is-muted ri-close-line');
  });

  it('draws the same element outside React', () => {
    const icon = createRemixIconElement(document, { name: 'ri-search-line', size: 16 });
    expect(icon.tagName).toBe('I');
    expect(icon.className).toBe('ri-icon ri-size-16 ri-search-line');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('reads names from untyped data', () => {
    expect(isRemixIconName('ri-link')).toBe(true);
    expect(isRemixIconName('ri-not-an-icon')).toBe(false);
    expect(readRemixIconName(' ri-link ')).toBe('ri-link');
    expect(readRemixIconName('ri-not-an-icon')).toBeNull();
    expect(readRemixIconName(42, 'ri-information-line')).toBe('ri-information-line');
  });
});
