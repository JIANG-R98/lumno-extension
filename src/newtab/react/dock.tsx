import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type {
  BottomDockLayoutOptions,
  ElementSource,
  LayoutConstants,
  LayoutControllerOptions
} from '../layout';
import { lazyInstance } from '../../shared/lazy-instance';

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

// What the dock needs of the layout controller it creates; see
// LumnoNewtabLayout. The dock hands the controller back as it got it.
export interface DockLayoutAdapter {
  updateBottomDockLayout(options?: BottomDockLayoutOptions): void;
}

export interface BottomDockRuntimeConfig<C extends DockLayoutAdapter = DockLayoutAdapter> {
  documentObj?: Document;
  windowObj?: Window;
  layoutRuntime: {
    createLayoutController(options: LayoutControllerOptions): C;
  };
  root?: ElementSource;
  searchLayer?: ElementSource;
  inputParts?: LayoutControllerOptions['inputParts'];
  topContentContainer?: ElementSource;
  shortcutSection?: ElementSource;
  quoteSection?: ElementSource;
  bookmarkSection: HTMLElement;
  recentSection: HTMLElement;
  suggestionsContainer?: ElementSource;
  suggestionsSurface?: ElementSource;
  suggestionsOutline?: ElementSource;
  getTopInsetPx?: () => number;
  constants?: LayoutConstants;
}

export interface DockRuntime<C extends DockLayoutAdapter = DockLayoutAdapter> {
  appendSections(): DockRuntime<C>;
  destroy(): void;
  element: HTMLDivElement;
  layoutController: C;
  mount(parent?: HTMLElement | null): DockRuntime<C>;
  onScroll(
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DockRuntime<C>;
  scroller: HTMLDivElement;
  sectionSafeCorridor: HTMLDivElement;
  updateLayout(options?: BottomDockLayoutOptions): void;
}

export function createBottomDockRuntime<C extends DockLayoutAdapter>(
  config: BottomDockRuntimeConfig<C>
): DockRuntime<C> {
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
  const runtime: DockRuntime<C> = {
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
    updateLayout(options) {
      layoutController.updateBottomDockLayout(options);
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

// The one instance a page or injected script draws through, made on first use.
export const getDockApi = lazyInstance(createDockApi);
