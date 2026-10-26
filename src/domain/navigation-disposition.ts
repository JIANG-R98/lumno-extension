// The parts of a mouse or keyboard event that decide where a link opens.
interface OpenEvent {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

type Disposition = 'backgroundTab' | 'newTab' | 'currentTab';

function isMiddleClick(event: OpenEvent | null | undefined): boolean {
  return Boolean(event && Number(event.button) === 1);
}

function isBackgroundOpenEvent(event: OpenEvent | null | undefined): boolean {
  return Boolean(event && (event.metaKey || event.ctrlKey || isMiddleClick(event)));
}

function getDisposition(event: OpenEvent | null | undefined, fallback?: Disposition): Disposition {
  return isBackgroundOpenEvent(event)
    ? 'backgroundTab'
    : (fallback || 'newTab');
}

// What decides where a result or card opens on a surface with a default tab.
interface DefaultTabOpen {
  // The surface opens in the current tab unless a key says otherwise.
  currentTabByDefault?: boolean;
  // Option/Alt: the other of the current and a new tab.
  openInOtherTab?: boolean;
  // Command/Ctrl or a middle click.
  openInBackgroundTab?: boolean;
}

// Option/Alt flips the surface's default tab and wins over Command/Ctrl,
// which otherwise opens in the background.
function getDefaultTabDisposition(options: DefaultTabOpen): Disposition {
  const defaultDisposition: Disposition = options.currentTabByDefault ? 'currentTab' : 'newTab';
  if (options.openInOtherTab) {
    return defaultDisposition === 'currentTab' ? 'newTab' : 'currentTab';
  }
  return options.openInBackgroundTab ? 'backgroundTab' : defaultDisposition;
}

export { getDefaultTabDisposition, getDisposition, isBackgroundOpenEvent, isMiddleClick };
export type { DefaultTabOpen, Disposition, OpenEvent };
