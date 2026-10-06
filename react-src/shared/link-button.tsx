import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type LinkButtonLabelProps = ComponentPropsWithoutRef<'span'> & {
  [dataAttribute: `data-${string}`]: string | undefined;
};

export interface LinkButtonProps
  extends Omit<ComponentPropsWithoutRef<'a'>, 'children'> {
  children?: ReactNode;
  /** Opens in a new tab (adds target/rel). */
  external?: boolean;
  /** Remix icon class rendered before the label, e.g. `ri-github-line`. */
  leadingIcon?: string;
  labelProps?: LinkButtonLabelProps;
}

const joinClassNames = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).join(' ');

export const LINK_BUTTON_CLASS = 'x-lumno-link-button';

export const LINK_BUTTON_ICON = 'ri-external-link-line';

// Text link with a trailing ↗ icon and no surface. Markup mirrors
// src/shared/link-button.css so static HTML can reuse the same classes.
export function LinkButton({
  children,
  className,
  external = false,
  labelProps,
  leadingIcon,
  rel,
  target,
  ...props
}: LinkButtonProps) {
  return (
    <a
      {...props}
      className={joinClassNames(LINK_BUTTON_CLASS, className)}
      rel={external ? rel || 'noopener noreferrer' : rel}
      target={external ? target || '_blank' : target}
    >
      {leadingIcon ? (
        <i
          aria-hidden="true"
          className={`ri-icon x-lumno-link-button__leading-icon ${leadingIcon}`}
        />
      ) : null}
      <span
        {...labelProps}
        className={joinClassNames('x-lumno-link-button__label', labelProps?.className)}
      >
        {children}
      </span>
      <i
        aria-hidden="true"
        className={`ri-icon x-lumno-link-button__icon ${LINK_BUTTON_ICON}`}
      />
    </a>
  );
}
