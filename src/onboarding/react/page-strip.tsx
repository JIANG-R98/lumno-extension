import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export interface PageStripRenderModel {
  pageCount: number;
  currentPageIndex: number;
  hidden: boolean;
  entering: boolean;
  ariaLabel: string;
  segmentAriaLabels: string[];
}

export interface PageStripController {
  render(model: PageStripRenderModel): void;
  destroy(): void;
}

export interface PageStripControllerOptions {
  onNavigate(slideIndex: number): void;
}

function getSafePageCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
}

export function createPageStripController(
  host: HTMLElement | null,
  options: PageStripControllerOptions
): PageStripController {
  if (!host) {
    return {
      render() {},
      destroy() {}
    };
  }

  const hostElement: HTMLElement = host;
  const reactRoot: Root = createRoot(hostElement);
  let destroyed = false;
  hostElement.setAttribute('data-react-island', 'onboarding-page-strip');

  function render(model: PageStripRenderModel): void {
    if (destroyed) {
      return;
    }
    const pageCount = getSafePageCount(model.pageCount);
    const currentPageIndex = Math.max(
      0,
      Math.min(pageCount - 1, Math.floor(Number(model.currentPageIndex) || 0))
    );
    hostElement.hidden = Boolean(model.hidden);
    hostElement.dataset.entering = model.entering ? 'true' : 'false';
    hostElement.style.setProperty('--page-strip-count', String(pageCount));
    hostElement.setAttribute('aria-label', String(model.ariaLabel || ''));

    flushSync(() => {
      reactRoot.render(
        model.hidden
          ? null
          : Array.from({ length: pageCount }, (_, pageIndex) => {
              const slideIndex = pageIndex + 1;
              const active = pageIndex === currentPageIndex;
              const style = {
                '--page-strip-segment-index': String(pageIndex)
              } as CSSProperties;
              const handleClick = (
                event: ReactMouseEvent<HTMLButtonElement>
              ): void => {
                event.preventDefault();
                event.stopPropagation();
                options.onNavigate(slideIndex);
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
            })
      );
    });
  }

  return Object.freeze({
    render,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      flushSync(() => {
        reactRoot.unmount();
      });
    }
  });
}

export function createPageStripApi() {
  return Object.freeze({
    implementation: 'react',
    createPageStripController
  });
}
