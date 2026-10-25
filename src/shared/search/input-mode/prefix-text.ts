// Setting the mode tag for a provider or scope, clearing it, and the site
// search Tab hint.
import type { ModeTagModel, TabHintModel } from './mode-tag-model';
import type {
  FormatMessage,
  InputModeProvider,
  InputModeTheme,
  IsElementVisible,
  PrefixContentOptions,
  SetStyle
} from './types';
import type { PrefixContentApi } from './prefix-content';
import type { PrefixMotionApi } from './prefix-motion';
import type { PrefixVisualApi } from './prefix-visual';

// The controller state search-input-mode.ts shares with its modules.
interface PrefixTextState {
  modeTagActive: boolean;
  inputModePrefixAnimation: Animation | null;
  inputModePrefixCurrentAnimation: Animation | null;
  inputModePrefixAnimationFrame: number | null;
  inputModePrefixAnimationTimer: number;
  inputModePrefixPendingText: string;
  modeTag: ModeTagModel;
  tabHint: TabHintModel;
}

interface PrefixTextConfig {
  onModeTagActiveChange?(active: boolean): void;
  // The surface shows something else where the Tab hint goes.
  isTabHintSuppressed?(): boolean;
}

interface PrefixTextOptions extends PrefixContentOptions {
  // Play the enter (or resize) motion.
  animate?: boolean;
  preserveModeMenuDoubleTab?: boolean;
}

interface PrefixTextDeps {
  config: PrefixTextConfig;
  siteSearchPrefix: HTMLElement;
  updateModeTag: (patch: Partial<ModeTagModel>) => void;
  updateTabHint: (patch: Partial<TabHintModel>) => void;
  resetModeMenuDoubleTab: () => void;
  resetModeTagRemovalConfirmation: () => void;
  isElementVisible: IsElementVisible;
  getInputModePrefixRenderedWidth: PrefixContentApi['getInputModePrefixRenderedWidth'];
  cancelInputModePrefixAnimation: PrefixMotionApi['cancelInputModePrefixAnimation'];
  settleInputModePrefixMenuVisualState: PrefixMotionApi['settleInputModePrefixMenuVisualState'];
  setStyle: SetStyle;
  prefixTransition: string;
  setInputModePrefixIdentity: PrefixContentApi['setInputModePrefixIdentity'];
  applyInputModePrefixVisual: PrefixVisualApi['applyInputModePrefixVisual'];
  syncInputPlaceholder: () => void;
  setInputStyle: (target: HTMLElement, property: string, value: string) => void;
  input: HTMLInputElement;
  updatePrefixLayout: () => void;
  measureInputModePrefixWidthForText: PrefixContentApi['measureInputModePrefixWidthForText'];
  playInputModePrefixResizeAnimation: PrefixMotionApi['playInputModePrefixResizeAnimation'];
  setInputModePrefixContent: PrefixContentApi['setInputModePrefixContent'];
  setInputModePrefixRestState: PrefixMotionApi['setInputModePrefixRestState'];
  playInputModePrefixEnterAnimation: PrefixMotionApi['playInputModePrefixEnterAnimation'];
  isAiSiteSearchProvider: (provider: InputModeProvider | null | undefined) => boolean;
  getProviderIcon: (provider: InputModeProvider | null | undefined) => string;
  getProviderThemeHost: (provider: InputModeProvider | null | undefined) => string;
  getSiteSearchPrefixText: (provider: InputModeProvider | null | undefined) => string;
  cancelInputModePrefixIconAnimation: PrefixContentApi['cancelInputModePrefixIconAnimation'];
  closeModeMenu: (restoreFocus?: boolean) => void;
  getDefaultPlaceholder: () => string;
  defaultCaretColor: string;
  getSiteSearchDisplayName: (provider: InputModeProvider | null | undefined) => string;
  formatMessage: FormatMessage;
  win: Partial<Pick<Window, 'matchMedia'>> | null | undefined;
  updateInputRightPadding: () => void;
  inputModeState: PrefixTextState;
}

function createPrefixText(deps: PrefixTextDeps) {
  const {
    config,
    siteSearchPrefix,
    updateModeTag,
    updateTabHint,
    resetModeMenuDoubleTab,
    resetModeTagRemovalConfirmation,
    isElementVisible,
    getInputModePrefixRenderedWidth,
    cancelInputModePrefixAnimation,
    settleInputModePrefixMenuVisualState,
    setStyle,
    prefixTransition,
    setInputModePrefixIdentity,
    applyInputModePrefixVisual,
    syncInputPlaceholder,
    setInputStyle,
    input,
    updatePrefixLayout,
    measureInputModePrefixWidthForText,
    playInputModePrefixResizeAnimation,
    setInputModePrefixContent,
    setInputModePrefixRestState,
    playInputModePrefixEnterAnimation,
    isAiSiteSearchProvider,
    getProviderIcon,
    getProviderThemeHost,
    getSiteSearchPrefixText,
    cancelInputModePrefixIconAnimation,
    closeModeMenu,
    getDefaultPlaceholder,
    defaultCaretColor,
    getSiteSearchDisplayName,
    formatMessage,
    win,
    updateInputRightPadding
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  function setModeTagActive(active: boolean): void {
    const nextActive = Boolean(active);
    if (inputModeState.modeTagActive === nextActive) {
      return;
    }
    inputModeState.modeTagActive = nextActive;
    if (typeof config.onModeTagActiveChange === 'function') {
      config.onModeTagActiveChange(nextActive);
    }
  }

  function setPrefixText(
    prefixText: string,
    theme?: InputModeTheme | null,
    prefixOptions?: PrefixTextOptions | null
  ): void {
    const nextOptions: PrefixTextOptions = prefixOptions || {};
    const nextPrefixText = String(prefixText || '');
    const shouldAnimate = Boolean(nextOptions.animate);
    const nextModeId = nextOptions.modeId ? String(nextOptions.modeId) : '';
    const previousModeId = inputModeState.modeTag.modeId;
    const previousPrefixText = inputModeState.modeTag.text;
    if (previousModeId !== nextModeId || previousPrefixText !== nextPrefixText) {
      if (!nextOptions.preserveModeMenuDoubleTab) {
        resetModeMenuDoubleTab();
      }
      resetModeTagRemovalConfirmation();
    }
    const isSameMode = previousModeId === nextModeId;
    const isRepeatedMode = Boolean(previousModeId && isSameMode);
    const shouldAnimateResize = Boolean(
      shouldAnimate &&
      previousModeId &&
      !isSameMode &&
      isElementVisible(siteSearchPrefix)
    );
    const hasActivePrefixAnimation = Boolean(
      inputModeState.inputModePrefixAnimation ||
      inputModeState.inputModePrefixCurrentAnimation ||
      inputModeState.inputModePrefixAnimationFrame !== null ||
      inputModeState.inputModePrefixAnimationTimer
    );
    const shouldWaitForPendingText = Boolean(
      !shouldAnimate &&
      isSameMode &&
      hasActivePrefixAnimation &&
      inputModeState.inputModePrefixPendingText === nextPrefixText
    );
    const previousWidth = shouldAnimateResize
      ? getInputModePrefixRenderedWidth()
      : 0;
    if (shouldAnimateResize) {
      cancelInputModePrefixAnimation();
      settleInputModePrefixMenuVisualState();
    }
    const shouldPreserveAnimation = !shouldAnimate && isSameMode && Boolean(
      hasActivePrefixAnimation
    );
    if (shouldAnimateResize) {
      setStyle(siteSearchPrefix, 'transition', prefixTransition);
    } else if (!shouldAnimate && !shouldPreserveAnimation) {
      setStyle(siteSearchPrefix, 'transition', 'none');
    }
    setInputModePrefixIdentity(nextPrefixText, nextOptions);
    const visual = applyInputModePrefixVisual(theme, nextOptions);
    updateModeTag({ visible: true });
    setModeTagActive(true);
    if (shouldWaitForPendingText) {
      syncInputPlaceholder();
      setInputStyle(input, 'caret-color', visual.caretColor);
      updatePrefixLayout();
      return;
    }
    const contentOptions: PrefixContentOptions = {
      ...nextOptions,
      animateIcon: shouldAnimate && !isRepeatedMode,
      animateOutgoingIcon: shouldAnimateResize,
      preserveIconAnimation: !shouldAnimate && isSameMode
    };
    if (shouldAnimateResize) {
      const targetWidth = measureInputModePrefixWidthForText(nextPrefixText);
      if (targetWidth > previousWidth + 0.5) {
        inputModeState.inputModePrefixPendingText = nextPrefixText;
        syncInputPlaceholder();
        setInputStyle(input, 'caret-color', visual.caretColor);
        updatePrefixLayout();
        playInputModePrefixResizeAnimation(previousWidth, targetWidth, {
          preservePendingText: true,
          onFinish: () => {
            if (inputModeState.inputModePrefixPendingText !== nextPrefixText) {
              return;
            }
            inputModeState.inputModePrefixPendingText = '';
            setInputModePrefixContent(nextPrefixText, contentOptions);
            updatePrefixLayout();
          }
        });
        return;
      }
    }
    setInputModePrefixContent(nextPrefixText, contentOptions);
    const nextWidth = shouldAnimateResize
      ? Number(siteSearchPrefix.getBoundingClientRect().width) || 0
      : 0;
    if (!shouldAnimate && !shouldPreserveAnimation) {
      setInputModePrefixRestState({ transition: false });
    }
    syncInputPlaceholder();
    setInputStyle(input, 'caret-color', visual.caretColor);
    updatePrefixLayout();
    if (shouldAnimate && !isRepeatedMode) {
      if (shouldAnimateResize) {
        playInputModePrefixResizeAnimation(previousWidth, nextWidth);
      } else {
        playInputModePrefixEnterAnimation();
      }
    }
  }

  function setProviderPrefix(
    provider: InputModeProvider | null | undefined,
    theme?: InputModeTheme | null,
    providerOptions?: PrefixTextOptions | null
  ): void {
    const isAi = isAiSiteSearchProvider(provider);
    const isAggregate = Boolean(
      provider && (
        provider._xIsAggregateSearch === true ||
        String(provider.action || '') === 'aggregateSearch' ||
        String(provider.category || '') === 'aggregateSearch'
      )
    );
    const nextOptions: PrefixTextOptions = {
      ...providerOptions,
      iconUrl: isAggregate ? '' : getProviderIcon(provider),
      iconHost: isAggregate ? '' : getProviderThemeHost(provider),
      iconClass: isAggregate ? 'ri-stack-line' : (isAi ? 'ri-search-ai-line' : 'ri-global-line'),
      modeId: isAggregate
        ? `aggregate:${String(provider && provider.aggregateId ? provider.aggregateId : '')}`
        : `provider:${provider && (provider.key || provider.name) ? (provider.key || provider.name) : ''}`,
      provider,
      isAi: isAi && !isAggregate
    };
    setPrefixText(getSiteSearchPrefixText(provider), theme, nextOptions);
  }

  function clearProviderPrefix(): void {
    resetModeMenuDoubleTab();
    resetModeTagRemovalConfirmation();
    cancelInputModePrefixIconAnimation();
    updateModeTag({ text: '', modeId: '', ariaLabel: '', icon: null, iconFailed: false });
    setInputModePrefixRestState({ transition: false });
    updateModeTag({ visible: false });
    setModeTagActive(false);
    closeModeMenu(false);
    input.placeholder = getDefaultPlaceholder();
    setInputStyle(input, 'caret-color', defaultCaretColor);
    updatePrefixLayout();
  }

  function getTabHintLabel(provider: InputModeProvider | null | undefined): string {
    const explicitLabel = provider && provider.tabHintLabel
      ? String(provider.tabHintLabel).trim()
      : '';
    return explicitLabel ||
      formatMessage('site_search_tab_hint', '使用 {site} 搜索', { site: getSiteSearchDisplayName(provider) });
  }

  // Touch-only devices have no Tab key, so the hint would only crowd the query.
  function hasNoTabKeyPointer(): boolean {
    return Boolean(
      win &&
      typeof win.matchMedia === 'function' &&
      win.matchMedia('(hover: none) and (pointer: coarse)').matches
    );
  }

  function setTabHintVisible(visible: boolean, provider?: InputModeProvider | null): void {
    if (!visible || hasNoTabKeyPointer()) {
      updateTabHint({ visible: false, title: '' });
      updateInputRightPadding();
      return;
    }
    if (typeof config.isTabHintSuppressed === 'function' && config.isTabHintSuppressed()) {
      return;
    }
    const label = getTabHintLabel(provider);
    updateTabHint({ visible: true, label, title: provider ? label : '' });
    updateInputRightPadding();
  }

  return {
    setPrefixText,
    setProviderPrefix,
    clearProviderPrefix,
    setTabHintVisible
  };
}

type PrefixTextApi = ReturnType<typeof createPrefixText>;

export { createPrefixText };
export type { PrefixTextApi, PrefixTextConfig, PrefixTextDeps, PrefixTextOptions, PrefixTextState };
