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

// An element, or a function that reads it when the layout runs.
type ElementSource = HTMLElement | null | undefined | (() => HTMLElement | null | undefined);

type DockLayoutConstants = typeof DEFAULT_DOCK_LAYOUT_CONSTANTS & Partial<Record<string, number>>;

// What the layout controller lays out; see LumnoNewtabLayout.
export interface DockLayoutControllerOptions {
  documentObj: Document;
  windowObj: Window;
  root: ElementSource;
  searchLayer: ElementSource;
  // The search input's parts; the layout reads their container.
  inputParts?: () => { container?: HTMLElement | null } | null | undefined;
  topContentContainer: ElementSource;
  shortcutSection: ElementSource;
  quoteSection: ElementSource;
  bottomDock: HTMLElement;
  bookmarkSection: ElementSource;
  recentSection: ElementSource;
  sectionSafeCorridor: HTMLElement;
  suggestionsContainer: ElementSource;
  suggestionsSurface: ElementSource;
  suggestionsOutline: ElementSource;
  getTopInsetPx?: () => number;
  constants: DockLayoutConstants;
}

export interface DockLayoutController {
  updateBottomDockLayout?(callbacks?: unknown): void;
  // Floats the suggestion list under the search box while it shows.
  setSuggestionsVisible?(visible: boolean): void;
  updateSuggestionsFloatingLayout?(): void;
}

export interface BottomDockRuntimeConfig {
  documentObj?: Document;
  windowObj?: Window;
  layoutRuntime: {
    createLayoutController(options: DockLayoutControllerOptions): DockLayoutController;
  };
  root?: ElementSource;
  searchLayer?: ElementSource;
  inputParts?: DockLayoutControllerOptions['inputParts'];
  topContentContainer?: ElementSource;
  shortcutSection?: ElementSource;
  quoteSection?: ElementSource;
  bookmarkSection: HTMLElement;
  recentSection: HTMLElement;
  suggestionsContainer?: ElementSource;
  suggestionsSurface?: ElementSource;
  suggestionsOutline?: ElementSource;
  getTopInsetPx?: () => number;
  constants?: Partial<Record<string, number>>;
}

export interface DockRuntime {
  appendSections(): DockRuntime;
  destroy(): void;
  element: HTMLDivElement;
  layoutController: DockLayoutController;
  mount(parent?: HTMLElement | null): DockRuntime;
  onScroll(
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DockRuntime;
  scroller: HTMLDivElement;
  sectionSafeCorridor: HTMLDivElement;
  updateLayout(callbacks?: unknown): void;
}

export function createBottomDockRuntime(config: BottomDockRuntimeConfig): DockRuntime {
  const documentObj: Document = config.documentObj || document;
  const windowObj: Window = config.windowObj || window;
  const layoutRuntime = config.layoutRuntime;
  if (!layoutRuntime || typeof layoutRuntime.createLayoutController !== 'function') {
    throw new Error(
      'LumnoNewtabDock requires LumnoNewtabLayout.createLayoutController().'
    );
  }
  const bottomDock = documentObj.createElement('div');
  bottomDock.id = DOCK_IDS.bottomDock;
  bottomDock.dataset.reactIsland = 'newtab-bottom-dock';
  const root: Root = createRoot(bottomDock);
  const mounted: { elements: DockElements | null } = { elements: null };
  const register = (nextElements: DockElements) => {
    mounted.elements = nextElements;
  };
  flushSync(() => root.render(<Dock register={register} />));
  if (!mounted.elements) {
    throw new Error('Lumno New Tab React dock did not mount.');
  }
  const { scroller, sectionSafeCorridor } = mounted.elements;
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
