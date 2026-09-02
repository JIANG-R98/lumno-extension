import {
  createReactRootController,
  type ReactRootController
} from '../shared/root-controller';
import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent
} from 'react';

export interface SegmentedControlItemModel {
  iconClass?: string;
  label: string;
  labelKey: string;
  value: string;
}

export interface SegmentedControlSelectModel {
  id: string;
}

export interface SegmentedControlRenderModel {
  activeValue: string;
  dataAttribute: `data-${string}`;
  disabled?: boolean;
  items: SegmentedControlItemModel[];
  select?: SegmentedControlSelectModel;
}

export interface SegmentedControlControllerOptions {
  kind: string;
  onSelect(value: string): void;
}

export type SegmentedControlController =
  ReactRootController<SegmentedControlRenderModel>;

function SegmentedControl({
  model,
  onSelect
}: {
  model: SegmentedControlRenderModel;
  onSelect(value: string): void;
}) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const itemSignature = model.items
    .map((item) => `${item.value}\u0000${item.label}`)
    .join('\u0001');

  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    const container = indicator?.parentElement;
    if (!indicator || !container) {
      return undefined;
    }
    let animationFrame = 0;
    let disposed = false;
    const measure = () => {
      if (disposed) {
        return;
      }
      const activeButton = container.querySelector<HTMLButtonElement>(
        'button[data-active="true"]'
      );
      if (!activeButton) {
        indicator.dataset.ready = 'false';
        indicator.style.width = '0px';
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      if (containerRect.width <= 0 || buttonRect.width <= 0) {
        indicator.dataset.ready = 'false';
        return;
      }
      const baseLeft = Number.parseFloat(window.getComputedStyle(indicator).left) || 0;
      const offset = Math.round(
        buttonRect.left - containerRect.left + container.scrollLeft - baseLeft
      );
      indicator.style.width = `${Math.round(buttonRect.width)}px`;
      indicator.style.transform = `translateX(${offset}px)`;
      indicator.dataset.ready = 'true';
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
  }, [model.activeValue, model.dataAttribute, itemSignature]);

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    if (model.disabled || model.items.length < 2) {
      return;
    }
    const { key } = event;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') {
      return;
    }
    event.preventDefault();
    const nextIndex = key === 'Home'
      ? 0
      : key === 'End'
        ? model.items.length - 1
        : (currentIndex + (key === 'ArrowRight' ? 1 : -1) + model.items.length) % model.items.length;
    const nextItem = model.items[nextIndex];
    const buttonGroup = event.currentTarget.parentElement;
    onSelect(nextItem.value);
    window.requestAnimationFrame(() => {
      const buttons = buttonGroup?.querySelectorAll<HTMLButtonElement>(
        `button[${model.dataAttribute}]`
      );
      buttons?.[nextIndex]?.focus();
    });
  };

  return (
    <>
      <span
        aria-hidden="true"
        className="_x_extension_theme_indicator_2024_unique_"
        data-ready="false"
        ref={indicatorRef}
      />
      {model.items.map((item, index) => {
        const active = item.value === model.activeValue;
        const dataProps = {
          [model.dataAttribute]: item.value
        };
        return (
          <button
            {...dataProps}
            aria-selected={active}
            aria-pressed={active}
            className="_x_extension_theme_option_2024_unique_"
            data-active={active ? 'true' : 'false'}
            disabled={model.disabled}
            key={item.value}
            onClick={() => onSelect(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="tab"
            type="button"
          >
            {item.iconClass ? (
              <i aria-hidden="true" className={item.iconClass} />
            ) : null}
            <span data-i18n={item.labelKey}>{item.label}</span>
          </button>
        );
      })}
      {model.select ? (
        <select
          aria-hidden="true"
          className="_x_extension_select_2024_unique_"
          id={model.select.id}
          onChange={(event) => onSelect(event.currentTarget.value)}
          disabled={model.disabled}
          style={{ display: 'none' }}
          tabIndex={-1}
          value={model.activeValue}
        >
          {model.items.map((item) => (
            <option data-i18n={item.labelKey} key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}
    </>
  );
}

export function createSegmentedControlController(
  host: HTMLElement | null,
  options: SegmentedControlControllerOptions
): SegmentedControlController {
  if (host) {
    host.dataset.reactIsland = 'options-segmented-control';
    host.dataset.segmentedKind = options.kind;
  }
  return createReactRootController(
    host,
    (model: SegmentedControlRenderModel) => (
      <SegmentedControl model={model} onSelect={options.onSelect} />
    )
  );
}

export function createSegmentedControlApi() {
  return Object.freeze({
    implementation: 'react',
    createSegmentedControlController
  });
}
