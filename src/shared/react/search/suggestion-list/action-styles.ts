// Inline styles for a row's action tags, search and utility buttons, and the
// selection and modifier labels kept in step across rows.
import type {
  SuggestionElement,
  NormalizedOptions,
  SuggestionActionTagElement,
  ModeTheme,
  SuggestionsRuntime,
  ThemeValue
} from './types';
import { setSurfaceStyle, surfaceCssValue } from './surface-options';
import { getActionLabel, getModifierAction } from './action-model';

export function setIconEmphasis(
  item: SuggestionElement,
  active: boolean
): void {
  if (!item._xIconWrap || item._xIconIsFavicon) {
    return;
  }
  item._xIconWrap.setAttribute(
    'data-emphasis',
    active ? 'true' : 'false'
  );
}

function setPalette(
  options: NormalizedOptions,
  button: HTMLElement,
  text?: unknown,
  bg?: unknown,
  border?: unknown
): void {
  setSurfaceStyle(
    options,
    button,
    '--x-nt-suggestion-action-button-text',
    text || 'var(--x-nt-subtext, #9CA3AF)'
  );
  setSurfaceStyle(
    options,
    button,
    '--x-nt-suggestion-action-button-bg',
    bg || 'transparent'
  );
  setSurfaceStyle(
    options,
    button,
    '--x-nt-suggestion-action-button-border',
    border || 'transparent'
  );
}

interface TagColors {
  bg: string;
  text: string;
  border: string;
}

// A tag's colors: its defaults while the row is plain; while the row is
// themed, the theme's tag colors, or only its text color for source tags
// (`textOnly`).
function readTagColors(tag: SuggestionActionTagElement, theme: ModeTheme, themed: boolean, textOnly: boolean,
  themedText: string): TagColors {
  if (!themed) {
    return {
      bg: tag._xDefaultBg || 'var(--x-nt-tag-bg, #F3F4F6)',
      text: tag._xDefaultText || 'var(--x-nt-tag-text, #667085)',
      border: tag._xDefaultBorder || 'transparent'
    };
  }
  if (textOnly) {
    return { bg: 'transparent', text: themedText || theme.accent || theme.tagText || '', border: 'transparent' };
  }
  return { bg: theme.tagBg || '', text: theme.tagText || '', border: theme.tagBorder || '' };
}

function applyTagStyle(
  options: NormalizedOptions,
  tag: SuggestionActionTagElement | null | undefined,
  theme: ModeTheme,
  themed: boolean,
  textOnly = false,
  themedText = ''
): void {
  if (!tag) {
    return;
  }
  const colors = readTagColors(tag, theme, themed, textOnly, themedText);
  setSurfaceStyle(options, tag, '--x-nt-suggestion-tag-bg', colors.bg);
  setSurfaceStyle(options, tag, '--x-nt-suggestion-tag-text', colors.text);
  setSurfaceStyle(options, tag, '--x-nt-suggestion-tag-border', colors.border);
}

// How a row stands in the selection as it is drawn now.
interface RowSelection {
  // The selected row.
  selected: boolean;
  // Selected, or the top row while nothing is selected.
  highlighted: boolean;
  hovering: boolean;
  theme: ThemeValue;
  // Drawn in its theme: highlighted, or hovered with a brand theme.
  themed: boolean;
  simpleMode: boolean;
}

function readRowSelection(options: NormalizedOptions, item: SuggestionElement, index: number, selectedIndex: number): RowSelection {
  const selected = index === selectedIndex;
  const highlighted = selected || Boolean(selectedIndex === -1 && item._xIsAutocompleteTop);
  const hovering = Boolean(item._xIsHovering);
  const theme = item._xTheme || options.defaultTheme;
  return {
    selected,
    highlighted,
    hovering,
    theme,
    themed: highlighted || (hovering && Boolean(theme?._xIsBrand)),
    simpleMode: Boolean(item._xSimpleMode)
  };
}

// The marks over the matched text: themed, or neutral grey.
function applyMarkStyles(options: NormalizedOptions, item: SuggestionElement, row: RowSelection): void {
  options.applyMarkVariables(item, row.themed ? row.theme : options.defaultTheme, row.highlighted);
  if (!row.themed) {
    setSurfaceStyle(options, item, '--x-ext-mark-bg', 'var(--x-nt-neutral-mark-bg, #E5E7EB)');
    setSurfaceStyle(options, item, '--x-ext-mark-text', 'var(--x-nt-neutral-mark-text, #111827)');
  }
}

// The visit button shows unless the highlighted row shows its action tags.
function applyVisitButtonStyles(options: NormalizedOptions, item: SuggestionElement, row: RowSelection, theme: ModeTheme): void {
  const button = item._xVisitButton;
  if (!button || !item._xActionModel) {
    return;
  }
  const visible = options.actionModel.shouldShowVisitButton
    ? options.actionModel.shouldShowVisitButton(item._xActionModel, row.highlighted)
    : !item._xAlwaysHideVisitButton && !(row.highlighted && item._xHasActionTags);
  button.setAttribute('data-visible', visible ? 'true' : 'false');
  if (row.themed) {
    setPalette(options, button, theme.buttonText, item._xSimpleMode ? theme.buttonBg : 'transparent',
      item._xSimpleMode ? theme.buttonBorder : 'transparent');
  } else {
    setPalette(options, button);
  }
}

// The source tags (history, bookmark, top site) show unless the row
// switches to its open tab, which shows the open tab tag instead.
function applySourceTagStyles(options: NormalizedOptions, item: SuggestionElement, row: RowSelection, theme: ModeTheme): void {
  let themedText = '';
  if (row.highlighted) {
    themedText = theme.accent || theme.tagText || '';
  } else if (row.themed) {
    themedText = options.getHoverColors(row.theme).text || theme.accent || theme.tagText || '';
  }
  const sourceTags = [item._xHistoryTag, item._xBookmarkTag, item._xTopSiteTag];
  const showSourceTags = !item._xSimpleMode && !item._xHasSwitchAction;
  sourceTags.forEach((tag) => {
    applyTagStyle(options, tag, theme, row.themed, true, themedText);
    tag?.setAttribute('data-visible', showSourceTags ? 'true' : 'false');
  });
  applyTagStyle(options, item._xOpenTabTag, theme, row.themed);
  item._xOpenTabTag?.setAttribute('data-visible', !item._xSimpleMode && item._xHasSwitchAction ? 'true' : 'false');
}

function applySearchActionStyles(runtime: SuggestionsRuntime, item: SuggestionElement, row: RowSelection): void {
  const { options } = runtime;
  const theme = options.getThemeForMode(row.theme);
  item.setAttribute('data-active', row.highlighted ? 'true' : 'false');
  item.setAttribute('data-has-action-tags', item._xHasActionTags ? 'true' : 'false');
  applyMarkStyles(options, item, row);
  applyVisitButtonStyles(options, item, row, theme);
  applySourceTagStyles(options, item, row, theme);
  item._xTagContainer?.setAttribute('data-visible', row.highlighted && item._xHasActionTags ? 'true' : 'false');
  if (item._xDirectIconWrap) {
    setSurfaceStyle(options, item._xDirectIconWrap, '--x-nt-suggestion-icon-color',
      row.themed && row.theme?._xIsBrand ? theme.accent || '' : 'var(--x-nt-subtext, #6B7280)');
  }
}

// An open tab row: its brand's hover color while selected; in the overlay,
// the switch action tag replaces the switch button while highlighted.
function applyOpenTabStyles(options: NormalizedOptions, item: SuggestionElement, row: RowSelection): void {
  if (!row.simpleMode && row.selected && row.theme?._xIsBrand) {
    setSurfaceStyle(options, item, '--x-nt-suggestion-active-bg', options.getHoverColors(row.theme).bg || '');
  }
  if (options.surface !== 'overlay') {
    return;
  }
  const showsTags = row.highlighted && Boolean(item._xHasActionTags);
  item._xTagContainer?.setAttribute('data-visible', showsTags ? 'true' : 'false');
  if (item._xSwitchButton) {
    item._xSwitchButton.setAttribute('data-visible', showsTags ? 'false' : 'true');
    setPalette(options, item._xSwitchButton, row.highlighted ? 'var(--x-ov-text, #1F2937)' : 'var(--x-ov-subtext, #9CA3AF)');
  }
}

function applyUtilityActionStyles(options: NormalizedOptions, item: SuggestionElement, row: RowSelection): void {
  const visible = row.hovering;
  const useTheme = visible && row.themed && !row.simpleMode;
  const neutralHover = row.simpleMode ? options.getNeutralHoverActionColors() : null;
  const color = useTheme ? row.theme?.buttonText || '' : surfaceCssValue(options, 'var(--x-nt-subtext, #6B7280)');
  item._xUtilityActions?.forEach(({ slot, button }) => {
    slot.setAttribute('data-visible', visible ? 'true' : 'false');
    button.setAttribute('data-visible', visible ? 'true' : 'false');
    setSurfaceStyle(options, button, '--x-nt-suggestion-utility-color', color);
    setSurfaceStyle(options, button, '--x-nt-suggestion-utility-bg', 'transparent');
    setSurfaceStyle(options, button, '--x-nt-suggestion-utility-border', 'transparent');
    if (neutralHover) {
      setSurfaceStyle(options, button, '--x-nt-suggestion-utility-hover-bg', neutralHover.bg || '');
      setSurfaceStyle(options, button, '--x-nt-suggestion-utility-hover-border', neutralHover.border || '');
      setSurfaceStyle(options, button, '--x-nt-suggestion-utility-hover-color', neutralHover.text || '');
    }
  });
}

// The highlighted row's background; the overlay and simple mode draw it
// inline, New Tab from its theme variables.
function applyHighlightBackground(options: NormalizedOptions, item: SuggestionElement, row: RowSelection): void {
  item.setAttribute('data-row-state', 'active');
  if (options.surface !== 'overlay' && !row.simpleMode) {
    return;
  }
  const highlightBg = row.simpleMode
    ? options.surface === 'overlay' ? 'var(--x-ov-hover-bg, #F3F4F6)' : 'var(--x-nt-hover-bg, #F3F4F6)'
    : options.getHighlightColors(row.theme).bg;
  setSurfaceStyle(options, item, '--x-nt-suggestion-active-bg', highlightBg || 'transparent');
}

// A row that is not highlighted: its hover background, in its brand's
// color when it has one.
function applyPlainBackground(options: NormalizedOptions, item: SuggestionElement, row: RowSelection): void {
  item.removeAttribute('data-row-state');
  const hoverBg = !row.simpleMode && row.hovering && row.theme?._xIsBrand ? options.getHoverColors(row.theme).bg : '';
  if (options.surface === 'overlay') {
    setSurfaceStyle(options, item, '--x-nt-suggestion-active-bg',
      row.hovering ? hoverBg || 'var(--x-ov-hover-bg, #F3F4F6)' : 'transparent');
  } else {
    setSurfaceStyle(options, item, '--x-nt-suggestion-hover-bg',
      row.hovering ? hoverBg || 'var(--x-nt-hover-bg, #F3F4F6)' : '');
  }
}

function applyRowSelection(runtime: SuggestionsRuntime, item: SuggestionElement, row: RowSelection): void {
  const { options } = runtime;
  if (row.highlighted) {
    applyHighlightBackground(options, item, row);
  } else {
    applyPlainBackground(options, item, row);
  }
  if (item._xTitle && options.surface === 'overlay') {
    item._xTitle.style.setProperty('--x-ov-suggestion-title-weight', row.highlighted ? '600' : '400');
  }
  setIconEmphasis(item, row.highlighted || row.hovering);
  if (item._xIsSearchSuggestion) {
    applySearchActionStyles(runtime, item, row);
  } else {
    applyOpenTabStyles(options, item, row);
  }
  applyUtilityActionStyles(options, item, row);
}

export function updateSelectionForRuntime(runtime: SuggestionsRuntime, selectedIndex?: number): void {
  const resolvedIndex = Number.isInteger(selectedIndex) ? Number(selectedIndex) : -1;
  const { options } = runtime;
  options.items.forEach((item, index) => {
    applyRowSelection(runtime, item, readRowSelection(options, item, index, resolvedIndex));
  });
}

export function syncModifierLabels(runtime: SuggestionsRuntime): void {
  runtime.options.items.forEach((item) => {
    const suggestion = item._xSuggestion;
    if (!suggestion) {
      return;
    }
    if (
      item._xVisitButtonLabel &&
      item._xVisitButtonAction
    ) {
      item._xVisitButtonLabel.textContent = getActionLabel(
        runtime,
        getModifierAction(runtime, item._xVisitButtonAction),
        suggestion
      );
      item._xVisitButton?.setAttribute(
        'aria-label',
        item._xVisitButtonLabel.textContent || ''
      );
    }
    item._xActionTags?.forEach((tag) => {
      if (!tag._xActionLabel || !tag._xAction) {
        return;
      }
      tag._xActionLabel.textContent = getActionLabel(
        runtime,
        getModifierAction(runtime, tag._xAction),
        suggestion
      );
    });
  });
}
