import { createActionButtonsApi } from './action-buttons';
import { createBodyCopyApi } from './body-copy';
import { createCopyHeadingApi } from './copy-heading';
import { createCursorLayerApi } from './cursor-layer';
import { createInteractionsApi } from './interactions';
import { createPageStripApi } from './page-strip';
import { createVisualSurfaceApi } from './visual-surface';
import { createTooltipViewApi } from '../../shared/react/tooltip-view';

declare global {
  var LumnoOnboardingActionsReact: ReturnType<typeof createActionButtonsApi> | undefined;
  var LumnoOnboardingBodyCopyReact: ReturnType<typeof createBodyCopyApi> | undefined;
  var LumnoOnboardingCopyHeadingReact: ReturnType<typeof createCopyHeadingApi> | undefined;
  var LumnoOnboardingCursorLayerReact: ReturnType<typeof createCursorLayerApi> | undefined;
  var LumnoOnboardingInteractionsReact: ReturnType<typeof createInteractionsApi> | undefined;
  var LumnoOnboardingPageStripReact: ReturnType<typeof createPageStripApi> | undefined;
  var LumnoOnboardingVisualSurfaceReact: ReturnType<typeof createVisualSurfaceApi> | undefined;
  var LumnoTooltipViewReact: ReturnType<typeof createTooltipViewApi> | undefined;
  var LumnoOnboardingReactBootstrap: {
      reactReady: boolean;
    } | undefined;
  var LumnoOnboardingReactIslands: {
      actions: ReturnType<typeof createActionButtonsApi>;
      bodyCopy: ReturnType<typeof createBodyCopyApi>;
      copyHeading: ReturnType<typeof createCopyHeadingApi>;
      cursorLayer: ReturnType<typeof createCursorLayerApi>;
      interactions: ReturnType<typeof createInteractionsApi>;
      pageStrip: ReturnType<typeof createPageStripApi>;
      visualSurface: ReturnType<typeof createVisualSurfaceApi>;
    } | undefined;
}

const runtime = globalThis;

const bootstrapState = runtime.LumnoOnboardingReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  const actionsApi = createActionButtonsApi();
  const bodyCopyApi = createBodyCopyApi();
  const copyHeadingApi = createCopyHeadingApi();
  const cursorLayerApi = createCursorLayerApi();
  const interactionsApi = createInteractionsApi();
  const pageStripApi = createPageStripApi();
  const visualSurfaceApi = createVisualSurfaceApi();
  const tooltipViewApi = createTooltipViewApi();

  runtime.LumnoOnboardingActionsReact = actionsApi;
  runtime.LumnoOnboardingActions = actionsApi;
  runtime.LumnoOnboardingBodyCopyReact = bodyCopyApi;
  runtime.LumnoOnboardingBodyCopy = bodyCopyApi;
  runtime.LumnoOnboardingCopyHeadingReact = copyHeadingApi;
  runtime.LumnoOnboardingCopyHeading = copyHeadingApi;
  runtime.LumnoOnboardingCursorLayerReact = cursorLayerApi;
  runtime.LumnoOnboardingCursorLayer = cursorLayerApi;
  runtime.LumnoOnboardingInteractionsReact = interactionsApi;
  runtime.LumnoOnboardingInteractions = interactionsApi;
  runtime.LumnoOnboardingPageStripReact = pageStripApi;
  runtime.LumnoOnboardingPageStrip = pageStripApi;
  runtime.LumnoOnboardingVisualSurfaceReact = visualSurfaceApi;
  runtime.LumnoOnboardingVisualSurface = visualSurfaceApi;
  runtime.LumnoTooltipViewReact = tooltipViewApi;
  runtime.LumnoTooltipView = tooltipViewApi;
  runtime.LumnoOnboardingReactIslands = Object.freeze({
    actions: actionsApi,
    bodyCopy: bodyCopyApi,
    copyHeading: copyHeadingApi,
    cursorLayer: cursorLayerApi,
    interactions: interactionsApi,
    pageStrip: pageStripApi,
    visualSurface: visualSurfaceApi
  });

  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
