// Which tile an arrow key moves to in the mode menu: along the row, or to
// the nearest tile of the next row, from where the tiles are laid out.

// Where a menu button sits, for moving by rows and columns.
interface ButtonLayout {
  bottom: number;
  centerX: number;
  centerY: number;
  height: number;
  index: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface ButtonRow {
  averageHeight: number;
  centerY: number;
  items: ButtonLayout[];
}

function getButtonLayout(button: HTMLElement, index: number): ButtonLayout {
  const rect = button.getBoundingClientRect();
  const left = Number(rect && rect.left) || 0;
  const top = Number(rect && rect.top) || 0;
  const width = Number(rect && rect.width) || 0;
  const height = Number(rect && rect.height) || 0;
  return {
    bottom: Number(rect && rect.bottom) || top + height,
    centerX: left + (width / 2),
    centerY: top + (height / 2),
    height,
    index,
    left,
    right: Number(rect && rect.right) || left + width,
    top,
    width
  };
}

function addToRows(rows: ButtonRow[], layout: ButtonLayout): void {
  let row = rows.find((candidate) => {
    const tolerance = Math.max(2, Math.min(candidate.averageHeight, layout.height) * 0.4);
    return Math.abs(candidate.centerY - layout.centerY) <= tolerance;
  });
  if (!row) {
    row = { averageHeight: layout.height, centerY: layout.centerY, items: [] };
    rows.push(row);
  }
  row.items.push(layout);
  const itemCount = row.items.length;
  row.centerY = row.items.reduce((total, item) => total + item.centerY, 0) / itemCount;
  row.averageHeight = row.items.reduce((total, item) => total + item.height, 0) / itemCount;
}

// The buttons grouped into rows by their vertical centers; null before layout.
function getButtonRows(buttons: HTMLElement[]): ButtonRow[] | null {
  const layouts = buttons.map((button, index) => getButtonLayout(button, index));
  if (!layouts.some((layout) => layout.width > 0 && layout.height > 0)) {
    return null;
  }
  const rows: ButtonRow[] = [];
  layouts.forEach((layout) => addToRows(rows, layout));
  rows.sort((left, right) => left.centerY - right.centerY);
  rows.forEach((row) => {
    row.items.sort((left, right) => left.centerX - right.centerX);
  });
  return rows;
}

// The nearest button of a row to a horizontal position.
function findClosestInRow(items: ButtonLayout[], centerX: number): ButtonLayout | null {
  let closest: ButtonLayout | null = null;
  for (const candidate of items) {
    if (!closest || Math.abs(candidate.centerX - centerX) < Math.abs(closest.centerX - centerX)) {
      closest = candidate;
    }
  }
  return closest;
}

function moveInRows(rows: ButtonRow[], currentIndex: number, key: string): number {
  const currentRowIndex = rows.findIndex((row) => row.items.some((item) => item.index === currentIndex));
  if (currentRowIndex < 0) {
    return currentIndex;
  }
  const currentRow = rows[currentRowIndex];
  const currentItemIndex = currentRow.items.findIndex((item) => item.index === currentIndex);
  const currentItem = currentRow.items[currentItemIndex];
  if (!currentItem) {
    return currentIndex;
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const target = currentRow.items[currentItemIndex + (key === 'ArrowRight' ? 1 : -1)];
    return target ? target.index : currentIndex;
  }
  const targetRow = rows[currentRowIndex + (key === 'ArrowDown' ? 1 : -1)];
  const closest = targetRow ? findClosestInRow(targetRow.items, currentItem.centerX) : null;
  return closest ? closest.index : currentIndex;
}

// The button an arrow key moves to; before layout, the next or previous one.
function getDirectionalIndex(buttons: HTMLElement[], currentIndex: number, key: string): number {
  if (buttons.length === 0) {
    return -1;
  }
  const movesForward = key === 'ArrowDown' || key === 'ArrowRight';
  if (currentIndex < 0) {
    return movesForward ? 0 : buttons.length - 1;
  }
  const rows = getButtonRows(buttons);
  if (!rows) {
    return ((currentIndex + (movesForward ? 1 : -1)) % buttons.length + buttons.length) % buttons.length;
  }
  return moveInRows(rows, currentIndex, key);
}

export { getDirectionalIndex };
