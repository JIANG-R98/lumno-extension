// The card a help center result shows while it is hovered or picked with the arrow keys: the
// passage around the match (src/domain/search/help-center/passage.ts builds it from the help center's
// index), laid out as the page has it, beside the result list. It wears the shared tooltip's
// look and theme (src/shared/ui/tooltip.css), so it matches every other tooltip on both surfaces.

export interface HelpPassageBlock {
  kind: 'heading' | 'text' | 'bullet' | 'step' | 'row';
  text?: string;
  marker?: string;
  cells?: string[];
  header?: boolean;
}

export type HighlightParts = (
  text: string
) => Array<{ text: string; highlighted: boolean }>;

export interface HelpPassageCardOptions {
  document: Document;
  // Where the card lives: the overlay's shadow root, or the New Tab body.
  getHost: () => Node | null;
  // The result list; the card sits to its right, else its left, else under it.
  getList: () => HTMLElement | null;
  highlight: HighlightParts;
}

export interface HelpPassageCard {
  show(row: HTMLElement, blocks: HelpPassageBlock[], options?: { delay?: boolean }): void;
  place(): void;
  hide(): void;
  destroy(): void;
}

const TOOLTIP_CLASS = '_x_extension_tooltip_2026_unique_';
const CARD_CLASS = '_x_extension_help_passage_2026_unique_';
const part = (name: string): string => `_x_extension_help_passage_${name}_2026_unique_`;
const GAP = 8;
// The first card waits a moment so passing over the list doesn't flash it; the next follows at once.
const HOVER_DELAY_MS = 250;

export function isHelpPassage(value: unknown): value is HelpPassageBlock[] {
  return Array.isArray(value) && value.length > 0 && value.every(
    (block) => typeof block === 'object' && block !== null && 'kind' in block && typeof block.kind === 'string'
  );
}

function appendElement(doc: Document, tag: string, className: string, parent: Node): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

// Draws a passage as the page has it: paragraphs and headings, bullet and
// numbered lists, and table rows, with the matched words marked.
class PassageWriter {
  private list: HTMLElement | null = null;
  private table: HTMLElement | null = null;
  private previousKind = '';
  private readonly doc: Document;
  private readonly target: HTMLElement;
  private readonly highlight: HighlightParts;

  constructor(doc: Document, target: HTMLElement, highlight: HighlightParts) {
    this.doc = doc;
    this.target = target;
    this.highlight = highlight;
  }

  write(block: HelpPassageBlock): void {
    if (block.kind === 'row') {
      this.writeRow(block);
    } else if (block.kind === 'bullet' || block.kind === 'step') {
      this.writeListItem(block);
    } else {
      this.fill(appendElement(this.doc, 'p', block.kind === 'heading' ? part('heading') : part('text'), this.target), String(block.text || ''));
    }
    this.previousKind = block.kind;
  }

  private writeRow(block: HelpPassageBlock): void {
    if (!this.table || this.previousKind !== 'row') {
      this.table = appendElement(this.doc, 'table', part('table'), this.target);
    }
    const tr = appendElement(this.doc, 'tr', '', this.table);
    (block.cells || []).forEach((cell) => {
      this.fill(appendElement(this.doc, block.header ? 'th' : 'td', part(block.header ? 'th' : 'td'), tr), cell);
    });
  }

  private writeListItem(block: HelpPassageBlock): void {
    if (!this.list || this.previousKind !== block.kind) {
      this.list = appendElement(this.doc, block.kind === 'step' ? 'ol' : 'ul', part('list'), this.target);
      const start = parseInt(String(block.marker || ''), 10);
      if (block.kind === 'step' && start > 1) {
        this.list.setAttribute('start', String(start));
      }
    }
    this.fill(appendElement(this.doc, 'li', part('item'), this.list), String(block.text || ''));
  }

  private fill(target: HTMLElement, text: string): void {
    this.highlight(text).forEach((piece) => {
      if (piece.highlighted) {
        appendElement(this.doc, 'mark', part('mark'), target).textContent = piece.text;
      } else {
        target.appendChild(this.doc.createTextNode(piece.text));
      }
    });
  }
}

interface CardPlacement {
  placement: 'right' | 'left' | 'bottom';
  x: number;
  y: number;
}

// To the right of the list, else its left, at the row's height; with no
// room beside the list, under it, never over the other results or the
// search box. Null when it fits nowhere.
function readCardPlacement(list: DOMRect, row: DOMRect, viewport: { width: number; height: number },
  card: { width: number; height: number }): CardPlacement | null {
  const clamp = (value: number, max: number): number => Math.max(GAP, Math.min(value, max - GAP));
  const y = clamp(row.top, viewport.height - card.height);
  const fitsRight = list.right + GAP + card.width <= viewport.width - GAP;
  const x = fitsRight ? list.right + GAP : list.left - GAP - card.width;
  if (x >= GAP) {
    return { placement: fitsRight ? 'right' : 'left', x, y };
  }
  if (list.bottom + GAP + card.height > viewport.height - GAP) {
    return null;
  }
  return { placement: 'bottom', x: clamp(list.left, viewport.width - card.width), y: list.bottom + GAP };
}

class PassageCard implements HelpPassageCard {
  private card: HTMLDivElement | null = null;
  private row: HTMLElement | null = null;
  private blocks: HelpPassageBlock[] | null = null;
  private timer = 0;
  private readonly options: HelpPassageCardOptions;
  private readonly win: (Window & typeof globalThis) | null;

  constructor(options: HelpPassageCardOptions) {
    this.options = options;
    this.win = options.document.defaultView;
  }

  show(nextRow: HTMLElement, passage: HelpPassageBlock[], showOptions?: { delay?: boolean }): void {
    this.clearTimer();
    const visible = this.card?.getAttribute('data-visible') === 'true';
    if (showOptions?.delay && !visible && this.win) {
      this.timer = this.win.setTimeout(() => {
        this.timer = 0;
        if (nextRow.isConnected) {
          this.reveal(nextRow, passage);
        }
      }, HOVER_DELAY_MS);
      return;
    }
    this.reveal(nextRow, passage);
  }

  readonly place = (): void => {
    const { card, row, win } = this;
    const list = this.options.getList();
    if (!card || !row || !list || !win) {
      return;
    }
    const placed = readCardPlacement(list.getBoundingClientRect(), row.getBoundingClientRect(),
      { width: win.innerWidth, height: win.innerHeight }, { width: card.offsetWidth, height: card.offsetHeight });
    if (!placed) {
      card.setAttribute('data-visible', 'false');
      return;
    }
    card.setAttribute('data-placement', placed.placement);
    card.style.setProperty('left', `${Math.round(placed.x)}px`);
    card.style.setProperty('top', `${Math.round(placed.y)}px`);
    card.setAttribute('data-visible', 'true');
    card.setAttribute('aria-hidden', 'false');
  };

  hide(): void {
    this.clearTimer();
    this.row = null;
    this.blocks = null;
    this.card?.setAttribute('data-visible', 'false');
    this.card?.setAttribute('aria-hidden', 'true');
  }

  destroy(): void {
    this.clearTimer();
    this.card?.remove();
    this.card = null;
    this.row = null;
    this.blocks = null;
  }

  private ensureCard(): HTMLDivElement | null {
    const host = this.options.getHost();
    if (!host) {
      return null;
    }
    if (!this.card) {
      const card = this.options.document.createElement('div');
      card.className = `${TOOLTIP_CLASS} ${CARD_CLASS}`;
      card.setAttribute('role', 'tooltip');
      card.setAttribute('translate', 'no');
      card.setAttribute('data-visible', 'false');
      card.setAttribute('aria-hidden', 'true');
      this.card = card;
    }
    if (this.card.parentNode !== host) {
      host.appendChild(this.card);
    }
    return this.card;
  }

  private reveal(nextRow: HTMLElement, passage: HelpPassageBlock[]): void {
    const target = this.ensureCard();
    if (!target) {
      return;
    }
    if (nextRow !== this.row || passage !== this.blocks) {
      target.replaceChildren();
      const writer = new PassageWriter(this.options.document, target, this.options.highlight);
      passage.forEach((block) => writer.write(block));
    }
    this.row = nextRow;
    this.blocks = passage;
    this.place();
  }

  private clearTimer(): void {
    if (this.timer && this.win) {
      this.win.clearTimeout(this.timer);
    }
    this.timer = 0;
  }
}

export function createHelpPassageCard(options: HelpPassageCardOptions): HelpPassageCard {
  return new PassageCard(options);
}
