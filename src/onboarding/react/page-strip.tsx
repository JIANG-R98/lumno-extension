import type { MouseEvent as ReactMouseEvent } from 'react';

export interface PageStripRenderModel {
  pageCount: number;
  currentPageIndex: number;
  hidden: boolean;
  entering: boolean;
  ariaLabel: string;
  segmentAriaLabels: string[];
}

export interface PageStripHandlers {
  onNavigate(slideIndex: number): void;
}

function getSafePageCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
}

// The step strip above the copy: one segment per page after the intro.
export function PageStrip({ model, handlers }: { model: PageStripRenderModel; handlers: PageStripHandlers }) {
  const pageCount = getSafePageCount(model.pageCount);
  const currentPageIndex = Math.max(
    0,
    Math.min(pageCount - 1, Math.floor(Number(model.currentPageIndex) || 0))
  );
  return (
    <div
      aria-label={String(model.ariaLabel || '')}
      className="page-strip"
      data-entering={model.entering ? 'true' : 'false'}
      hidden={Boolean(model.hidden)}
      id="onboarding-page-strip"
      role="group"
      style={{ '--page-strip-count': String(pageCount) }}
    >
      {model.hidden
        ? null
        : Array.from({ length: pageCount }, (_, pageIndex) => {
            const slideIndex = pageIndex + 1;
            const active = pageIndex === currentPageIndex;
            const style = {
              '--page-strip-segment-index': String(pageIndex)
            };
            const handleClick = (
              event: ReactMouseEvent<HTMLButtonElement>
            ): void => {
              event.preventDefault();
              event.stopPropagation();
              handlers.onNavigate(slideIndex);
            };

            return (
              <button
                aria-current={active ? 'step' : undefined}
                aria-label={String(
                  model.segmentAriaLabels[pageIndex] || `Page ${slideIndex}`
                )}
                className="page-strip-segment"
                data-active={active ? 'true' : 'false'}
                data-slide-target={String(slideIndex)}
                key={slideIndex}
                onClick={handleClick}
                style={style}
                type="button"
              />
            );
          })}
    </div>
  );
}
