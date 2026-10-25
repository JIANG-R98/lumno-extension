import { useLayoutEffect, type RefObject } from 'react';
import { queryHtmlElement } from '../dom-lookup';

// The one implementation of the sliding indicator under a segmented control's active
// button. React controls use the hook; the page modules call the same functions through
// globalThis.LumnoSegmentedIndicator (registered by the page's React entry).

export interface SegmentedIndicatorMeasurement {
  /** False while the control is hidden or has no active button. */
  ready: boolean;
  transform: string | null;
  width: string;
}

const ACTIVE_BUTTON_SELECTOR = 'button[data-active="true"]';

/**
 * Places the indicator over the active button. Tabs hug their labels, so widths differ.
 * Offsets are measured in the container's layout space: they undo any transform scale on
 * an ancestor (opening panels), the container border, its horizontal scroll and the
 * indicator's own CSS inset.
 */
export function measureSegmentedIndicator(
  container: HTMLElement,
  indicator: HTMLElement,
  activeButton: HTMLElement | null
): SegmentedIndicatorMeasurement {
  if (!activeButton) {
    return { ready: false, transform: null, width: '0px' };
  }
  const containerRect = container.getBoundingClientRect();
  const buttonRect = activeButton.getBoundingClientRect();
  if (containerRect.width <= 0 || buttonRect.width <= 0) {
    return { ready: false, transform: null, width: indicator.style.width || '0px' };
  }
  const scale = container.offsetWidth > 0 ? containerRect.width / container.offsetWidth : 1;
  const scaleX = scale > 0 ? scale : 1;
  const view = container.ownerDocument.defaultView || window;
  const indicatorInset = Number.parseFloat(view.getComputedStyle(indicator).left) || 0;
  const offset = Math.round(
    (buttonRect.left - containerRect.left) / scaleX +
      container.scrollLeft -
      container.clientLeft -
      indicatorInset
  );
  return {
    ready: true,
    transform: `translateX(${offset}px)`,
    width: `${Math.round(buttonRect.width / scaleX)}px`
  };
}

/**
 * The first placement after mounting (or after being hidden) snaps into place; only
 * moves between options slide. Measuring has already styled the indicator at width 0,
 * so without this it would grow in from the left edge every time a control appears.
 */
export function applySegmentedIndicator(
  indicator: HTMLElement,
  measurement: SegmentedIndicatorMeasurement
) {
  const snap = measurement.ready && indicator.dataset.ready !== 'true';
  if (snap) {
    indicator.style.transition = 'none';
  }
  indicator.style.width = measurement.width;
  if (measurement.transform !== null) {
    indicator.style.transform = measurement.transform;
  }
  indicator.dataset.ready = measurement.ready ? 'true' : 'false';
  if (snap) {
    void indicator.offsetWidth;
    indicator.style.transition = '';
  }
}

/** Measures and applies in one step; the indicator's parent is the segmented container. */
export function syncSegmentedIndicator(
  indicator: HTMLElement | null,
  activeSelector: string = ACTIVE_BUTTON_SELECTOR
) {
  const container = indicator?.parentElement;
  if (!indicator || !container) {
    return;
  }
  applySegmentedIndicator(
    indicator,
    measureSegmentedIndicator(container, indicator, queryHtmlElement(container, activeSelector))
  );
}

/**
 * Keeps an indicator on the active button across renders (`signature` should change
 * with the active value and labels), container resizes, hidden panels becoming visible
 * and late font loads.
 */
export function useSegmentedIndicator(
  indicatorRef: RefObject<HTMLSpanElement | null>,
  signature: string,
  activeSelector: string = ACTIVE_BUTTON_SELECTOR
) {
  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    const container = indicator?.parentElement;
    if (!indicator || !container) {
      return undefined;
    }
    let animationFrame = 0;
    let disposed = false;
    const measure = () => {
      if (!disposed) {
        syncSegmentedIndicator(indicator, activeSelector);
      }
    };
    const scheduleMeasure = () => {
      if (disposed) {
        return;
      }
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measure);
    };

    measure();
    scheduleMeasure();
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(measure)
      : null;
    resizeObserver?.observe(container);
    document.fonts?.ready.then(scheduleMeasure).catch(() => {});

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [activeSelector, indicatorRef, signature]);
}

export function createSegmentedIndicatorApi() {
  return Object.freeze({
    apply: applySegmentedIndicator,
    measure: measureSegmentedIndicator,
    sync: syncSegmentedIndicator
  });
}
