import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useSegmentedIndicator } from '../shared/segmented-indicator';
import {
  createReactRootController,
  type ReactRootController
} from './root-controller';

export interface SettingsNavigationItemModel {
  iconClass: string;
  key: string;
  label: string;
  labelKey: string;
}

export interface SettingsNavigationRenderModel {
  activeKey: string;
  items: SettingsNavigationItemModel[];
}

export interface SettingsNavigationControllerOptions {
  onSelect(key: string): void;
}

export type SettingsNavigationController =
  ReactRootController<SettingsNavigationRenderModel>;

/**
 * Labels never wrap, so a long translation makes the strip scroll sideways. Mark which
 * edges hide tabs (the stylesheet fades them) and keep the active tab in view.
 */
function useTabStripOverflow(
  indicatorRef: RefObject<HTMLSpanElement | null>,
  activeKey: string
) {
  useLayoutEffect(() => {
    const strip = indicatorRef.current?.parentElement;
    if (!strip) {
      return undefined;
    }
    const update = () => {
      const maxScroll = strip.scrollWidth - strip.clientWidth;
      strip.dataset.overflowStart = strip.scrollLeft > 1 ? 'true' : 'false';
      strip.dataset.overflowEnd = strip.scrollLeft < maxScroll - 1 ? 'true' : 'false';
    };
    update();
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    resizeObserver?.observe(strip);
    strip.addEventListener('scroll', update, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      strip.removeEventListener('scroll', update);
    };
  }, [indicatorRef]);

  useLayoutEffect(() => {
    const strip = indicatorRef.current?.parentElement;
    const active = strip?.querySelector<HTMLElement>('button[data-active="true"]');
    if (!strip || !active || strip.scrollWidth <= strip.clientWidth) {
      return;
    }
    const edge = 24;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left - edge < strip.scrollLeft) {
      strip.scrollLeft = Math.max(0, left - edge);
    } else if (right + edge > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = right + edge - strip.clientWidth;
    }
  }, [activeKey, indicatorRef]);
}

function SettingsNavigation({
  model,
  onSelect
}: {
  model: SettingsNavigationRenderModel;
  onSelect(key: string): void;
}) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useSegmentedIndicator(
    indicatorRef,
    `${model.activeKey}\u0002${model.items.map((item) => item.label).join('\u0001')}`
  );
  useTabStripOverflow(indicatorRef, model.activeKey);
  return (
    <>
      <span
        aria-hidden="true"
        className="_x_extension_tabs_indicator_2024_unique_"
        ref={indicatorRef}
      />
      {model.items.map((item) => {
        const active = item.key === model.activeKey;
        return (
          <button
            aria-current={active ? 'page' : undefined}
            aria-pressed={active}
            className="_x_extension_settings_tab_button_2024_unique_"
            data-active={active ? 'true' : 'false'}
            data-tab={item.key}
            key={item.key}
            onClick={() => onSelect(item.key)}
            type="button"
          >
            <i
              aria-hidden="true"
              className={`_x_extension_tab_icon_2024_unique_ ${item.iconClass}`}
            />
            <span data-i18n={item.labelKey}>{item.label}</span>
          </button>
        );
      })}
    </>
  );
}

export function createSettingsNavigationController(
  host: HTMLElement | null,
  options: SettingsNavigationControllerOptions
): SettingsNavigationController {
  if (host) {
    host.dataset.reactIsland = 'options-settings-navigation';
  }
  return createReactRootController(
    host,
    (model: SettingsNavigationRenderModel) => (
      <SettingsNavigation model={model} onSelect={options.onSelect} />
    )
  );
}

export function createSettingsNavigationApi() {
  return Object.freeze({
    implementation: 'react',
    createSettingsNavigationController
  });
}
