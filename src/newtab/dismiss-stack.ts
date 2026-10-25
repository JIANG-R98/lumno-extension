// One Escape press dismisses one layer: the open layer that opened last,
// or a layer with a higher priority (an active drag) whenever it is open.
//
// Each layer registers once with `isOpen` and `close`; the stack never
// needs to be told when a layer opens or closes. It notes which layers
// are open at the start of every press, key press, hover change and focus
// change (capture phase, before the event can open anything), so a layer
// that opened since then counts as opened after every layer already seen.
interface DismissLayer {
  isOpen(): boolean;
  close(event?: KeyboardEvent | null): void;
  // A layer with a higher priority is dismissed first whenever it is open.
  priority?: number;
}

interface RegisteredLayer {
  key: string;
  isOpen(): boolean;
  close(event?: KeyboardEvent | null): void;
  priority: number;
  registeredAt: number;
  open: boolean;
  openedAt: number;
}

type DismissIgnore = (event: KeyboardEvent) => boolean;

interface DismissStackOptions {
  documentObj?: Document | null;
  // Escape presses it returns true for are left alone.
  shouldIgnore?: DismissIgnore;
}

function createDismissStack(options?: DismissStackOptions) {
  const opts = options || {};
  const documentObj = opts.documentObj || (typeof document !== 'undefined' ? document : null);
  const layers = new Map<string, RegisteredLayer>();
  let openCount = 0;
  let registerCount = 0;
  let listening = false;
  let shouldIgnore: DismissIgnore | null = typeof opts.shouldIgnore === 'function' ? opts.shouldIgnore : null;

  function isLayerOpen(layer: RegisteredLayer): boolean {
    try {
      return Boolean(layer.isOpen());
    } catch (_error) {
      return false;
    }
  }

  // Layers seen opening in the same refresh keep their registration order.
  function refresh(): void {
    layers.forEach((layer) => {
      const open = isLayerOpen(layer);
      if (open && !layer.open) {
        openCount += 1;
        layer.openedAt = openCount;
      }
      layer.open = open;
    });
  }

  function getTopLayer(): RegisteredLayer | null {
    refresh();
    let top: RegisteredLayer | null = null;
    for (const layer of layers.values()) {
      if (!layer.open) {
        continue;
      }
      if (!top || layer.priority > top.priority ||
          (layer.priority === top.priority &&
            (layer.openedAt > top.openedAt ||
              (layer.openedAt === top.openedAt && layer.registeredAt > top.registeredAt)))) {
        top = layer;
      }
    }
    return top;
  }

  function dismissTop(event?: KeyboardEvent | null): boolean {
    const top = getTopLayer();
    if (!top) {
      return false;
    }
    // Nothing else sees this Escape, not even a listener on the document
    // added later by a menu underneath.
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
    top.close(event);
    refresh();
    return true;
  }

  function handleKeyDown(event: KeyboardEvent | null | undefined): void {
    if (!event || event.key !== 'Escape' || event.defaultPrevented || event.isComposing ||
        (shouldIgnore && shouldIgnore(event))) {
      refresh();
      return;
    }
    dismissTop(event);
  }

  function listen(): void {
    if (listening || !documentObj || typeof documentObj.addEventListener !== 'function') {
      return;
    }
    listening = true;
    documentObj.addEventListener('keydown', handleKeyDown, true);
    ['pointerdown', 'pointerover', 'focusin'].forEach((type) => {
      documentObj.addEventListener(type, refresh, true);
    });
  }

  // Registers (or replaces) the layer `key`; `isOpen()` says whether it
  // is showing, `close(event)` dismisses it.
  function register(key: string, layer: DismissLayer): void {
    if (!key || !layer || typeof layer.close !== 'function' || typeof layer.isOpen !== 'function') {
      return;
    }
    const previous = layers.get(key);
    registerCount += 1;
    layers.set(key, {
      key,
      close: layer.close,
      isOpen: layer.isOpen,
      priority: Number(layer.priority) || 0,
      registeredAt: previous ? previous.registeredAt : registerCount,
      open: previous ? previous.open : false,
      openedAt: previous ? previous.openedAt : 0
    });
    listen();
  }

  function setShouldIgnore(predicate: DismissIgnore | null): void {
    shouldIgnore = typeof predicate === 'function' ? predicate : null;
  }

  return {
    register,
    refresh,
    dismissTop,
    handleKeyDown,
    setShouldIgnore,
    getTopKey: () => {
      const top = getTopLayer();
      return top ? top.key : '';
    }
  };
}

type DismissStack = ReturnType<typeof createDismissStack>;

let sharedStack: DismissStack | null = null;
function getDismissStack(): DismissStack {
  if (!sharedStack) {
    sharedStack = createDismissStack();
  }
  return sharedStack;
}

export { createDismissStack, getDismissStack };
export type { DismissLayer, DismissStack };
