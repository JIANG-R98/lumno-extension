// The shapes the selection toolbar's modules share.
import type * as INTENT from '../../domain/selection-intent';

type SelectionClassification = ReturnType<typeof INTENT.classifySelection>;

interface ViewportBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

// Where the selection sits in the viewport; inline is the end of its last
// line, where the entry button goes.
interface SelectionRect extends ViewportBounds {
  inline: ViewportBounds & { height: number };
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;

// A selection in the page's text, with its ends to tell it from a new one.
interface DomSelectionSnapshot {
  sourceKind: 'dom';
  element: Element;
  text: string;
  rect: SelectionRect;
  anchorNode: Node | null;
  anchorOffset: number;
  focusNode: Node | null;
  focusOffset: number;
}

// A selection inside a text field, which the page's selection does not show.
interface TextControlSelectionSnapshot {
  sourceKind: 'text-control';
  element: TextControl;
  text: string;
  rect: SelectionRect;
  start: number;
  end: number;
}

type SelectionSnapshot = DomSelectionSnapshot | TextControlSelectionSnapshot;

// A selection worth offering actions for.
interface SelectionCandidate {
  classification: SelectionClassification;
  rect: SelectionRect;
  sourceKind: SelectionSnapshot['sourceKind'];
  snapshot: SelectionSnapshot;
}

interface PointerDownState {
  pointerId: number;
  // The selection when the button went down, to tell a new one apart.
  selection: SelectionSnapshot | null;
}

// The toolbar's elements, all made together in a closed shadow root.
interface SelectionSurface {
  host: HTMLDivElement;
  shadow: ShadowRoot;
  surface: HTMLDivElement;
  material: HTMLSpanElement;
  mainButton: HTMLButtonElement;
  selectionLogo: HTMLImageElement;
  mainLabel: HTMLSpanElement;
  primaryDivider: HTMLSpanElement;
  contentViewport: HTMLDivElement;
  actionsViewport: HTMLDivElement;
  menu: HTMLDivElement;
}

// Widths the toolbar opens through, measured once it has its final size.
interface ToolbarGeometry {
  contentOffset: number;
  contentWidth: number;
  expandedWidth: number;
}

interface ColorRgba {
  a: number;
  b: number;
  g: number;
  r: number;
}

// How the page behind the entry button reads, for a button that stays visible.
type EntryContrastTone = 'dark' | 'light' | 'mixed';

interface IconDefinition {
  viewBox: string;
  path: string;
}

// A page listener the feature adds while it is on and removes when it is off.
interface PageListener {
  attach(): void;
  detach(): void;
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isTextControlType(type: string): boolean {
  return ['text', 'search', 'url', 'tel', 'email'].includes(type.toLowerCase());
}

export {
  isElementNode,
  isTextControlType
};
export type {
  ColorRgba,
  DomSelectionSnapshot,
  EntryContrastTone,
  IconDefinition,
  PageListener,
  PointerDownState,
  SelectionCandidate,
  SelectionClassification,
  SelectionRect,
  SelectionSnapshot,
  SelectionSurface,
  TextControl,
  TextControlSelectionSnapshot,
  ToolbarGeometry,
  ViewportBounds
};
