// @ts-nocheck
function isMiddleClick(event) {
  return Boolean(event && Number(event.button) === 1);
}

function isBackgroundOpenEvent(event) {
  return Boolean(event && (event.metaKey || event.ctrlKey || isMiddleClick(event)));
}

function getDisposition(event, fallback) {
  return isBackgroundOpenEvent(event)
    ? 'backgroundTab'
    : (fallback || 'newTab');
}

export { getDisposition, isBackgroundOpenEvent, isMiddleClick };
