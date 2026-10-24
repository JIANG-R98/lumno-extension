// The parts of a mouse or keyboard event that decide where a link opens.
interface OpenEvent {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
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

export { getDisposition, isBackgroundOpenEvent, isMiddleClick };
export type { Disposition, OpenEvent };
