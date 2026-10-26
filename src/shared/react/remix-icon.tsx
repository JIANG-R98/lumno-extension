import type { HTMLAttributes } from 'react';
import { getRemixIconClassName, type RemixIconSpec } from '../ui/remix-icon';

type RemixIconProps = RemixIconSpec & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>;

// A Remix Icon glyph, drawn by the bundled icon font.
export function RemixIcon({ name, size, className, ...attributes }: RemixIconProps) {
  return <i aria-hidden="true" {...attributes} className={getRemixIconClassName({ name, size, className })} />;
}
