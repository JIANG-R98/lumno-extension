// The built-in line icons a search mode can show in its tag and its menu
// tile (bookmarks, browser content, history, favorites), as SVG path data
// on a 24 by 24 grid.

const MODE_LINE_ICON_PATHS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  bookmark: ['M18 7v14l-6-4l-6 4V7a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4'],
  browser: ['M4 8h16M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm4-2v4'],
  history: ['M12 8v4l2 2', 'M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5'],
  star: ['m12 17.75l-6.172 3.245l1.179-6.873l-5-4.867l6.9-1l3.086-6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z']
});

// The paths of a built-in line icon; null when there is no icon by that name.
function getModeLineIconPaths(iconName: string): readonly string[] | null {
  return Object.prototype.hasOwnProperty.call(MODE_LINE_ICON_PATHS, iconName)
    ? MODE_LINE_ICON_PATHS[iconName]
    : null;
}

export { getModeLineIconPaths };
