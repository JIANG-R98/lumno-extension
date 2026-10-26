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

interface PrefixTextContext {
  readonly config: PrefixTextDeps['config'];
  readonly siteSearchPrefix: PrefixTextDeps['siteSearchPrefix'];
  readonly updateModeTag: PrefixTextDeps['updateModeTag'];
  readonly updateTabHint: PrefixTextDeps['updateTabHint'];
  readonly resetModeMenuDoubleTab: PrefixTextDeps['resetModeMenuDoubleTab'];
  readonly resetModeTagRemovalConfirmation: PrefixTextDeps['resetModeTagRemovalConfirmation'];
  readonly isElementVisible: PrefixTextDeps['isElementVisible'];
  readonly getInputModePrefixRenderedWidth: PrefixTextDeps['getInputModePrefixRenderedWidth'];
  readonly cancelInputModePrefixAnimation: PrefixTextDeps['cancelInputModePrefixAnimation'];
  readonly settleInputModePrefixMenuVisualState: PrefixTextDeps['settleInputModePrefixMenuVisualState'];
  readonly setStyle: PrefixTextDeps['setStyle'];
  readonly prefixTransition: PrefixTextDeps['prefixTransition'];
  readonly setInputModePrefixIdentity: PrefixTextDeps['setInputModePrefixIdentity'];
  readonly applyInputModePrefixVisual: PrefixTextDeps['applyInputModePrefixVisual'];
  readonly syncInputPlaceholder: PrefixTextDeps['syncInputPlaceholder'];
  readonly setInputStyle: PrefixTextDeps['setInputStyle'];
  readonly input: PrefixTextDeps['input'];
  readonly updatePrefixLayout: PrefixTextDeps['updatePrefixLayout'];
  readonly measureInputModePrefixWidthForText: PrefixTextDeps['measureInputModePrefixWidthForText'];
  readonly playInputModePrefixResizeAnimation: PrefixTextDeps['playInputModePrefixResizeAnimation'];
  readonly setInputModePrefixContent: PrefixTextDeps['setInputModePrefixContent'];
  readonly setInputModePrefixRestState: PrefixTextDeps['setInputModePrefixRestState'];
  readonly playInputModePrefixEnterAnimation: PrefixTextDeps['playInputModePrefixEnterAnimation'];
  readonly isAiSiteSearchProvider: PrefixTextDeps['isAiSiteSearchProvider'];
  readonly getProviderIcon: PrefixTextDeps['getProviderIcon'];
  readonly getProviderThemeHost: PrefixTextDeps['getProviderThemeHost'];
  readonly getSiteSearchPrefixText: PrefixTextDeps['getSiteSearchPrefixText'];
  readonly cancelInputModePrefixIconAnimation: PrefixTextDeps['cancelInputModePrefixIconAnimation'];
  readonly closeModeMenu: PrefixTextDeps['closeModeMenu'];
  readonly getDefaultPlaceholder: PrefixTextDeps['getDefaultPlaceholder'];
  readonly defaultCaretColor: PrefixTextDeps['defaultCaretColor'];
  readonly getSiteSearchDisplayName: PrefixTextDeps['getSiteSearchDisplayName'];
  readonly formatMessage: PrefixTextDeps['formatMessage'];
  readonly win: PrefixTextDeps['win'];
  readonly updateInputRightPadding: PrefixTextDeps['updateInputRightPadding'];
  readonly inputModeState: PrefixTextDeps['inputModeState'];
}

function setModeTagActive(ctx: PrefixTextContext, active: boolean): void {
  const nextActive = Boolean(active);
  if (ctx.inputModeState.modeTagActive === nextActive) {
    return;
  }
  ctx.inputModeState.modeTagActive = nextActive;
  if (typeof ctx.config.onModeTagActiveChange === 'function') {
    ctx.config.onModeTagActiveChange(nextActive);
  }
}

// How a change of the mode tag's text plays out.
interface PrefixTextPlan {
  text: string;
  options: PrefixTextOptions;
  animate: boolean;
  sameMode: boolean;
  repeatedMode: boolean;
  // The tag changes to another mode while showing: it resizes.
  animateResize: boolean;
  // The same mode again while an animation runs: that animation goes on.
  preserveAnimation: boolean;
  // That animation is already bringing in this text.
  waitForPendingText: boolean;
}

function hasActivePrefixAnimation(ctx: PrefixTextContext): boolean {
  const state = ctx.inputModeState;
  return Boolean(
    state.inputModePrefixAnimation ||
    state.inputModePrefixCurrentAnimation ||
    state.inputModePrefixAnimationFrame !== null ||
    state.inputModePrefixAnimationTimer
  );
}

function planPrefixText(ctx: PrefixTextContext, text: string, options: PrefixTextOptions): PrefixTextPlan {
  const animate = Boolean(options.animate);
  const previousModeId = ctx.inputModeState.modeTag.modeId;
  const sameMode = previousModeId === (options.modeId ? String(options.modeId) : '');
  const animationActive = hasActivePrefixAnimation(ctx);
  return {
    text,
    options,
    animate,
    sameMode,
    repeatedMode: Boolean(previousModeId && sameMode),
    animateResize: Boolean(animate && previousModeId && !sameMode && ctx.isElementVisible(ctx.siteSearchPrefix)),
    preserveAnimation: !animate && sameMode && animationActive,
    waitForPendingText: !animate && sameMode && animationActive &&
      ctx.inputModeState.inputModePrefixPendingText === text
  };
}

// A different mode or text ends a pending double Tab and tag removal.
function resetPendingModeKeys(ctx: PrefixTextContext, plan: PrefixTextPlan): void {
  const modeTag = ctx.inputModeState.modeTag;
  if (plan.sameMode && modeTag.text === plan.text) {
    return;
  }
  if (!plan.options.preserveModeMenuDoubleTab) {
    ctx.resetModeMenuDoubleTab();
  }
  ctx.resetModeTagRemovalConfirmation();
}

function applyPrefixTransition(ctx: PrefixTextContext, plan: PrefixTextPlan): void {
  if (plan.animateResize) {
    ctx.setStyle(ctx.siteSearchPrefix, 'transition', ctx.prefixTransition);
  } else if (!plan.animate && !plan.preserveAnimation) {
    ctx.setStyle(ctx.siteSearchPrefix, 'transition', 'none');
  }
}

function finishPrefixFrame(ctx: PrefixTextContext, caretColor: string): void {
  ctx.syncInputPlaceholder();
  ctx.setInputStyle(ctx.input, 'caret-color', caretColor);
  ctx.updatePrefixLayout();
}

// A tag growing to a longer name widens first and shows the new name once
// it fits. Returns false when the tag does not grow.
function growPrefixBeforeContent(
  ctx: PrefixTextContext,
  plan: PrefixTextPlan,
  previousWidth: number,
  contentOptions: PrefixContentOptions,
  caretColor: string
): boolean {
  const targetWidth = ctx.measureInputModePrefixWidthForText(plan.text);
  if (targetWidth <= previousWidth + 0.5) {
    return false;
  }
  ctx.inputModeState.inputModePrefixPendingText = plan.text;
  finishPrefixFrame(ctx, caretColor);
  ctx.playInputModePrefixResizeAnimation(previousWidth, targetWidth, {
    preservePendingText: true,
    onFinish: () => {
      if (ctx.inputModeState.inputModePrefixPendingText !== plan.text) {
        return;
      }
      ctx.inputModeState.inputModePrefixPendingText = '';
      ctx.setInputModePrefixContent(plan.text, contentOptions);
      ctx.updatePrefixLayout();
    }
  });
  return true;
}

function setPrefixText(
  ctx: PrefixTextContext,
  prefixText: string,
  theme?: InputModeTheme | null,
  prefixOptions?: PrefixTextOptions | null
): void {
  const plan = planPrefixText(ctx, String(prefixText || ''), prefixOptions || {});
  resetPendingModeKeys(ctx, plan);
  const previousWidth = plan.animateResize ? ctx.getInputModePrefixRenderedWidth() : 0;
  if (plan.animateResize) {
    ctx.cancelInputModePrefixAnimation();
    ctx.settleInputModePrefixMenuVisualState();
  }
  applyPrefixTransition(ctx, plan);
  ctx.setInputModePrefixIdentity(plan.text, plan.options);
  const visual = ctx.applyInputModePrefixVisual(theme, plan.options);
  ctx.updateModeTag({ visible: true });
  setModeTagActive(ctx, true);
  if (plan.waitForPendingText) {
    finishPrefixFrame(ctx, visual.caretColor);
    return;
  }
  showPrefixContent(ctx, plan, previousWidth, visual.caretColor);
}

function showPrefixContent(ctx: PrefixTextContext, plan: PrefixTextPlan, previousWidth: number, caretColor: string): void {
  const contentOptions: PrefixContentOptions = {
    ...plan.options,
    animateIcon: plan.animate && !plan.repeatedMode,
    animateOutgoingIcon: plan.animateResize,
    preserveIconAnimation: !plan.animate && plan.sameMode
  };
  if (plan.animateResize && growPrefixBeforeContent(ctx, plan, previousWidth, contentOptions, caretColor)) {
    return;
  }
  ctx.setInputModePrefixContent(plan.text, contentOptions);
  const nextWidth = plan.animateResize ? Number(ctx.siteSearchPrefix.getBoundingClientRect().width) || 0 : 0;
  if (!plan.animate && !plan.preserveAnimation) {
    ctx.setInputModePrefixRestState({ transition: false });
  }
  finishPrefixFrame(ctx, caretColor);
  if (!plan.animate || plan.repeatedMode) {
    return;
  }
  if (plan.animateResize) {
    ctx.playInputModePrefixResizeAnimation(previousWidth, nextWidth);
  } else {
    ctx.playInputModePrefixEnterAnimation();
  }
}

// The aggregate search scope across several sites.
function isAggregateProvider(provider: InputModeProvider | null | undefined): boolean {
  return Boolean(provider && (
    provider._xIsAggregateSearch === true ||
    String(provider.action || '') === 'aggregateSearch' ||
    String(provider.category || '') === 'aggregateSearch'
  ));
}

function getProviderModeId(provider: InputModeProvider | null | undefined, isAggregate: boolean): string {
  if (isAggregate) {
    return `aggregate:${String(provider && provider.aggregateId ? provider.aggregateId : '')}`;
  }
  return `provider:${provider && (provider.key || provider.name) ? (provider.key || provider.name) : ''}`;
}

function setProviderPrefix(
  ctx: PrefixTextContext,
  provider: InputModeProvider | null | undefined,
  theme?: InputModeTheme | null,
  providerOptions?: PrefixTextOptions | null
): void {
  const isAi = ctx.isAiSiteSearchProvider(provider);
  const isAggregate = isAggregateProvider(provider);
  const nextOptions: PrefixTextOptions = {
    ...providerOptions,
    iconUrl: isAggregate ? '' : ctx.getProviderIcon(provider),
    iconHost: isAggregate ? '' : ctx.getProviderThemeHost(provider),
    iconName: isAggregate ? 'ri-stack-line' : (isAi ? 'ri-search-ai-line' : 'ri-global-line'),
    modeId: getProviderModeId(provider, isAggregate),
    provider,
    isAi: isAi && !isAggregate
  };
  setPrefixText(ctx, ctx.getSiteSearchPrefixText(provider), theme, nextOptions);
}

function clearProviderPrefix(ctx: PrefixTextContext): void {
  ctx.resetModeMenuDoubleTab();
  ctx.resetModeTagRemovalConfirmation();
  ctx.cancelInputModePrefixIconAnimation();
  ctx.updateModeTag({ text: '', modeId: '', ariaLabel: '', icon: null, iconFailed: false });
  ctx.setInputModePrefixRestState({ transition: false });
  ctx.updateModeTag({ visible: false });
  setModeTagActive(ctx, false);
  ctx.closeModeMenu(false);
  ctx.input.placeholder = ctx.getDefaultPlaceholder();
  ctx.setInputStyle(ctx.input, 'caret-color', ctx.defaultCaretColor);
  ctx.updatePrefixLayout();
}

function getTabHintLabel(ctx: PrefixTextContext, provider: InputModeProvider | null | undefined): string {
  const explicitLabel = provider && provider.tabHintLabel
    ? String(provider.tabHintLabel).trim()
    : '';
  return explicitLabel ||
    ctx.formatMessage('site_search_tab_hint', '使用 {site} 搜索', { site: ctx.getSiteSearchDisplayName(provider) });
}

// Touch-only devices have no Tab key, so the hint would only crowd the query.
function hasNoTabKeyPointer(ctx: PrefixTextContext): boolean {
  return Boolean(
    ctx.win &&
    typeof ctx.win.matchMedia === 'function' &&
    ctx.win.matchMedia('(hover: none) and (pointer: coarse)').matches
  );
}

function setTabHintVisible(ctx: PrefixTextContext, visible: boolean, provider?: InputModeProvider | null): void {
  if (!visible || hasNoTabKeyPointer(ctx)) {
    ctx.updateTabHint({ visible: false, title: '' });
    ctx.updateInputRightPadding();
    return;
  }
  if (typeof ctx.config.isTabHintSuppressed === 'function' && ctx.config.isTabHintSuppressed()) {
    return;
  }
  const label = getTabHintLabel(ctx, provider);
  ctx.updateTabHint({ visible: true, label, title: provider ? label : '' });
  ctx.updateInputRightPadding();
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
  const ctx: PrefixTextContext = {
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
    updateInputRightPadding,
    inputModeState
  };

  return {
    setPrefixText: (prefixText: string, theme?: InputModeTheme | null, prefixOptions?: PrefixTextOptions | null) => setPrefixText(ctx, prefixText, theme, prefixOptions),
    setProviderPrefix: (provider: InputModeProvider | null | undefined, theme?: InputModeTheme | null, providerOptions?: PrefixTextOptions | null) => setProviderPrefix(ctx, provider, theme, providerOptions),
    clearProviderPrefix: () => clearProviderPrefix(ctx),
    setTabHintVisible: (visible: boolean, provider?: InputModeProvider | null) => setTabHintVisible(ctx, visible, provider)
  };
}

type PrefixTextApi = ReturnType<typeof createPrefixText>;

export { createPrefixText };
export type { PrefixTextApi, PrefixTextConfig, PrefixTextDeps, PrefixTextOptions, PrefixTextState };
