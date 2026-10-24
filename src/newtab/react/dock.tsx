import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export const DOCK_IDS = Object.freeze({
  bottomDock: '_x_extension_newtab_bottom_dock_2024_unique_',
  scroller: '_x_extension_newtab_bottom_dock_scroller_2024_unique_',
  sectionSafeCorridor:
    '_x_extension_newtab_section_safe_corridor_2026_unique_'
});

export const DEFAULT_DOCK_LAYOUT_CONSTANTS = Object.freeze({
  bottomDockTopReservePx: 240,
  compactDockViewportMaxHeightPx: 800,
  compactDockSearchGapPx: 30,
  compactDockShortcutGapPx: 8,
  compactDockMinTopReservePx: 168
});

interface DockElements {
  scroller: HTMLDivElement;
  sectionSafeCorridor: HTMLDivElement;
}

function Dock({
  register
}: {
  register(elements: DockElements): void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const corridorRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scrollerRef.current && corridorRef.current) {
      register({
        scroller: scrollerRef.current,
        sectionSafeCorridor: corridorRef.current
      });
    }
  }, [register]);
  return (
    <div id={DOCK_IDS.scroller} ref={scrollerRef}>
      <div id={DOCK_IDS.sectionSafeCorridor} ref={corridorRef} />
    </div>
  );
}

export interface DockRuntime {
  appendSections(): DockRuntime;
  destroy(): void;
  element: HTMLDivElement;
  layoutController: {
    updateBottomDockLayout?(callbacks?: unknown): void;
  };
  mount(parent?: HTMLElement | null): DockRuntime;
  onScroll(
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DockRuntime;
  scroller: HTMLDivElement;
  sectionSafeCorridor: HTMLDivElement;
  updateLayout(callbacks?: unknown): void;
}

export function createBottomDockRuntime(config: Record<string, any>): DockRuntime {
  const documentObj: Document = config.documentObj || document;
  const windowObj: Window = config.windowObj || window;
  const layoutRuntime = config.layoutRuntime || {};
  if (typeof layoutRuntime.createLayoutController !== 'function') {
    throw new Error(
      'LumnoNewtabDock requires LumnoNewtabLayout.createLayoutController().'
    );
  }
  const bottomDock = documentObj.createElement('div');
  bottomDock.id = DOCK_IDS.bottomDock;
  bottomDock.dataset.reactIsland = 'newtab-bottom-dock';
  const root: Root = createRoot(bottomDock);
  let elements: DockElements | null = null;
  const register = (nextElements: DockElements) => {
    elements = nextElements;
  };
  flushSync(() => root.render(<Dock register={register} />));
  if (!elements) {
    throw new Error('Lumno New Tab React dock did not mount.');
  }
  const { scroller, sectionSafeCorridor } = elements as DockElements;
  const layoutController = layoutRuntime.createLayoutController({
    documentObj,
    windowObj,
    root: config.root,
    searchLayer: config.searchLayer,
    inputParts: config.inputParts,
    topContentContainer: config.topContentContainer,
    shortcutSection: config.shortcutSection,
    quoteSection: config.quoteSection,
    bottomDock,
    bookmarkSection: config.bookmarkSection,
    recentSection: config.recentSection,
    sectionSafeCorridor,
    suggestionsContainer: config.suggestionsContainer,
    suggestionsSurface: config.suggestionsSurface,
    suggestionsOutline: config.suggestionsOutline,
    getTopInsetPx: config.getTopInsetPx,
    constants: {
      ...DEFAULT_DOCK_LAYOUT_CONSTANTS,
      ...(config.constants || {})
    }
  });
  let destroyed = false;
  const runtime: DockRuntime = {
    appendSections() {
      scroller.appendChild(config.bookmarkSection);
      scroller.appendChild(sectionSafeCorridor);
      scroller.appendChild(config.recentSection);
      return runtime;
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      flushSync(() => root.unmount());
    },
    element: bottomDock,
    layoutController,
    mount(parent) {
      runtime.appendSections();
      (parent || documentObj.body).appendChild(bottomDock);
      return runtime;
    },
    onScroll(listener, eventOptions) {
      scroller.addEventListener('scroll', listener, eventOptions);
      return runtime;
    },
    scroller,
    sectionSafeCorridor,
    updateLayout(callbacks) {
      layoutController.updateBottomDockLayout?.(callbacks);
    }
  };
  return runtime;
}

export function createDockApi() {
  return Object.freeze({
    DEFAULT_LAYOUT_CONSTANTS: DEFAULT_DOCK_LAYOUT_CONSTANTS,
    IDS: DOCK_IDS,
    implementation: 'react',
    createBottomDockRuntime
  });
}
