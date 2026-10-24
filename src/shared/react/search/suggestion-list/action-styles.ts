// Inline styles for a row's action tags, search and utility buttons, and the
// selection and modifier labels kept in step across rows.
import type {
  SuggestionElement,
  NormalizedOptions,
  SuggestionActionTagElement,
  ModeTheme,
  SuggestionsRuntime,
  ThemeValue,
  Suggestion
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

function applyTagStyle(
  options: NormalizedOptions,
  tag: SuggestionActionTagElement | null | undefined,
  theme: ModeTheme,
  active: boolean,
  textOnlyTheme = false,
  themedText = ''
): void {
  if (!tag) {
    return;
  }
  setSurfaceStyle(
    options,
    tag,
    '--x-nt-suggestion-tag-bg',
    (
      active
        ? textOnlyTheme ? 'transparent' : theme.tagBg || ''
        : tag._xDefaultBg || 'var(--x-nt-tag-bg, #F3F4F6)'
    )
  );
  setSurfaceStyle(
    options,
    tag,
    '--x-nt-suggestion-tag-text',
    (
      active
        ? textOnlyTheme
          ? themedText || theme.accent || theme.tagText || ''
          : theme.tagText || ''
        : tag._xDefaultText || 'var(--x-nt-tag-text, #667085)'
    )
  );
  setSurfaceStyle(
    options,
    tag,
    '--x-nt-suggestion-tag-border',
    (
      active
        ? textOnlyTheme ? 'transparent' : theme.tagBorder || ''
        : tag._xDefaultBorder || 'transparent'
    )
  );
}

function applySearchActionStyles(
  runtime: SuggestionsRuntime,
  item: SuggestionElement,
  themeValue: ThemeValue,
  active: boolean,
  hovering: boolean
): void {
  const { options } = runtime;
  const theme = options.getThemeForMode(themeValue);
  const themed = active || (
    hovering && Boolean(themeValue?._xIsBrand)
  );
  const themedSourceTagText = active
    ? theme.accent || theme.tagText || ''
    : themed
      ? options.getHoverColors(themeValue).text ||
        theme.accent ||
        theme.tagText ||
        ''
      : '';
  item.setAttribute('data-active', active ? 'true' : 'false');
  item.setAttribute(
    'data-has-action-tags',
    item._xHasActionTags ? 'true' : 'false'
  );
  options.applyMarkVariables(
    item,
    themed ? themeValue : options.defaultTheme,
    active
  );
  if (!themed) {
    setSurfaceStyle(
      options,
      item,
      '--x-ext-mark-bg',
      'var(--x-nt-neutral-mark-bg, #E5E7EB)'
    );
    setSurfaceStyle(
      options,
      item,
      '--x-ext-mark-text',
      'var(--x-nt-neutral-mark-text, #111827)'
    );
  }
  if (item._xVisitButton && item._xActionModel) {
    const visible = options.actionModel.shouldShowVisitButton
      ? options.actionModel.shouldShowVisitButton(
          item._xActionModel,
          active
        )
      : Boolean(
          !item._xAlwaysHideVisitButton &&
          !(active && item._xHasActionTags)
        );
    item._xVisitButton.setAttribute(
      'data-visible',
      visible ? 'true' : 'false'
    );
    if (themed) {
      setPalette(
        options,
        item._xVisitButton,
        theme.buttonText,
        item._xSimpleMode ? theme.buttonBg : 'transparent',
        item._xSimpleMode ? theme.buttonBorder : 'transparent'
      );
    } else {
      setPalette(options, item._xVisitButton);
    }
  }
  applyTagStyle(
    options,
    item._xHistoryTag,
    theme,
    themed,
    true,
    themedSourceTagText
  );
  applyTagStyle(
    options,
    item._xBookmarkTag,
    theme,
    themed,
    true,
    themedSourceTagText
  );
  applyTagStyle(
    options,
    item._xTopSiteTag,
    theme,
    themed,
    true,
    themedSourceTagText
  );
  applyTagStyle(options, item._xOpenTabTag, theme, themed);
  const showSourceTags = !item._xSimpleMode && !item._xHasSwitchAction;
  [
    item._xHistoryTag,
    item._xBookmarkTag,
    item._xTopSiteTag
  ].forEach((tag) => {
    tag?.setAttribute(
      'data-visible',
      showSourceTags ? 'true' : 'false'
    );
  });
  item._xOpenTabTag?.setAttribute(
    'data-visible',
    !item._xSimpleMode && item._xHasSwitchAction ? 'true' : 'false'
  );
  item._xTagContainer?.setAttribute(
    'data-visible',
    active && item._xHasActionTags ? 'true' : 'false'
  );
}

function applyUtilityActionStyles(
  options: NormalizedOptions,
  item: SuggestionElement,
  theme: ThemeValue,
  themed: boolean
): void {
  const visible = Boolean(item._xIsHovering);
  const simpleMode = Boolean(item._xSimpleMode);
  const useTheme = visible && themed && !simpleMode;
  const neutralHover = simpleMode
    ? options.getNeutralHoverActionColors()
    : null;
  item._xUtilityActions?.forEach(({ slot, button }) => {
    slot.setAttribute('data-visible', visible ? 'true' : 'false');
    button.setAttribute('data-visible', visible ? 'true' : 'false');
    setSurfaceStyle(
      options,
      button,
      '--x-nt-suggestion-utility-color',
      useTheme
        ? theme?.buttonText || ''
        : surfaceCssValue(
            options,
            'var(--x-nt-subtext, #6B7280)'
          )
    );
    setSurfaceStyle(
      options,
      button,
      '--x-nt-suggestion-utility-bg',
      'transparent'
    );
    setSurfaceStyle(
      options,
      button,
      '--x-nt-suggestion-utility-border',
      'transparent'
    );
    if (neutralHover) {
      setSurfaceStyle(
        options,
        button,
        '--x-nt-suggestion-utility-hover-bg',
        neutralHover.bg || ''
      );
      setSurfaceStyle(
        options,
        button,
        '--x-nt-suggestion-utility-hover-border',
        neutralHover.border || ''
      );
      setSurfaceStyle(
        options,
        button,
        '--x-nt-suggestion-utility-hover-color',
        neutralHover.text || ''
      );
    }
  });
}

export function updateSelectionForRuntime(
  runtime: SuggestionsRuntime,
  selectedIndex?: number
): void {
  const resolvedIndex = Number.isInteger(selectedIndex)
    ? Number(selectedIndex)
    : -1;
  const { options } = runtime;
  options.items.forEach((item, index) => {
    const selected = index === resolvedIndex;
    const autoHighlighted = Boolean(
      resolvedIndex === -1 && item._xIsAutocompleteTop
    );
    const highlighted = selected || autoHighlighted;
    const hovering = Boolean(item._xIsHovering);
    const theme = item._xTheme || options.defaultTheme;
    const themed = highlighted || (
      hovering && Boolean(theme?._xIsBrand)
    );
    const simpleMode = Boolean(item._xSimpleMode);
    const hoverColors = !simpleMode && hovering && theme?._xIsBrand
      ? options.getHoverColors(theme)
      : null;
    if (highlighted) {
      item.setAttribute('data-row-state', 'active');
      if (options.surface === 'overlay' || simpleMode) {
        const highlight = simpleMode
          ? {
              bg: options.surface === 'overlay'
                ? 'var(--x-ov-hover-bg, #F3F4F6)'
                : 'var(--x-nt-hover-bg, #F3F4F6)'
            }
          : options.getHighlightColors(theme);
        setSurfaceStyle(
          options,
          item,
          '--x-nt-suggestion-active-bg',
          highlight.bg || 'transparent'
        );
      }
    } else {
      item.removeAttribute('data-row-state');
      if (options.surface === 'overlay') {
        setSurfaceStyle(
          options,
          item,
          '--x-nt-suggestion-active-bg',
          hovering
            ? hoverColors?.bg || 'var(--x-ov-hover-bg, #F3F4F6)'
            : 'transparent'
        );
      } else if (hovering) {
        setSurfaceStyle(
          options,
          item,
          '--x-nt-suggestion-hover-bg',
          hoverColors?.bg || 'var(--x-nt-hover-bg, #F3F4F6)'
        );
      } else {
        setSurfaceStyle(
          options,
          item,
          '--x-nt-suggestion-hover-bg',
          ''
        );
      }
    }
    if (item._xTitle && options.surface === 'overlay') {
      item._xTitle.style.setProperty(
        '--x-ov-suggestion-title-weight',
        highlighted ? '600' : '400'
      );
    }
    setIconEmphasis(
      item,
      Boolean(highlighted || hovering)
    );
    if (item._xIsSearchSuggestion) {
      applySearchActionStyles(
        runtime,
        item,
        theme,
        highlighted,
        hovering
      );
      if (item._xDirectIconWrap) {
        const modeTheme = options.getThemeForMode(theme);
        setSurfaceStyle(
          options,
          item._xDirectIconWrap,
          '--x-nt-suggestion-icon-color',
          (
            themed && theme?._xIsBrand
              ? modeTheme.accent || ''
              : 'var(--x-nt-subtext, #6B7280)'
          )
        );
      }
    } else {
      if (!simpleMode && selected && theme?._xIsBrand) {
        const hover = options.getHoverColors(theme);
        setSurfaceStyle(
          options,
          item,
          '--x-nt-suggestion-active-bg',
          hover.bg || ''
        );
      }
      if (options.surface === 'overlay') {
        const active = highlighted;
        item._xTagContainer?.setAttribute(
          'data-visible',
          active && item._xHasActionTags ? 'true' : 'false'
        );
        if (item._xSwitchButton) {
          item._xSwitchButton.setAttribute(
            'data-visible',
            active && item._xHasActionTags ? 'false' : 'true'
          );
          setPalette(
            options,
            item._xSwitchButton,
            active
              ? 'var(--x-ov-text, #1F2937)'
              : 'var(--x-ov-subtext, #9CA3AF)'
          );
        }
      }
    }
    applyUtilityActionStyles(
      options,
      item,
      theme,
      themed
    );
  });
}

export function syncModifierLabels(runtime: SuggestionsRuntime): void {
  runtime.options.items.forEach((item) => {
    if (!item._xSuggestion) {
      return;
    }
    if (
      item._xVisitButtonLabel &&
      item._xVisitButtonAction
    ) {
      item._xVisitButtonLabel.textContent = getActionLabel(
        runtime,
        getModifierAction(runtime, item._xVisitButtonAction),
        item._xSuggestion
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
        item._xSuggestion as Suggestion
      );
    });
  });
}
