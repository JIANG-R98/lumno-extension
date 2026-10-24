import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

// Shared shell for the wallpaper settings and shortcut icon mode controls.
export function SegmentedTabs({
  ariaHidden,
  ariaLabel,
  children,
  className,
  dataVisible,
  indicatorClassName,
  indicatorRef,
  indicatorStyle,
  name,
  referenceAttribute = 'data-wallpaper-ref',
  role,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> & {
  ariaHidden?: boolean | 'false' | 'true';
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  dataVisible?: 'false' | 'true';
  indicatorClassName: string;
  indicatorRef: string;
  indicatorStyle?: CSSProperties;
  name: string;
  referenceAttribute?: `data-${string}`;
  role: 'group' | 'tablist';
}) {
  return (
    <div
      {...props}
      {...{ [referenceAttribute]: name }}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      className={`x-nt-segmented-tabs ${className}`}
      data-visible={dataVisible}
      role={role}
    >
      <span
        {...{ [referenceAttribute]: indicatorRef }}
        aria-hidden="true"
        className={`x-nt-segmented-tabs-indicator ${indicatorClassName}`}
        style={indicatorStyle}
      />
      {children}
    </div>
  );
}
