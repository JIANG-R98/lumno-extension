import { createCopyPanelApi } from './copy-panel';
import { createCursorLayerApi } from './cursor-layer';
import { createVisualSurfaceApi } from './visual-surface';
import { createTooltipViewApi } from '../../shared/react/tooltip-view';

declare global {
  var LumnoOnboardingCopyPanelReact: ReturnType<typeof createCopyPanelApi> | undefined;
  var LumnoOnboardingCursorLayerReact: ReturnType<typeof createCursorLayerApi> | undefined;
  var LumnoOnboardingVisualSurfaceReact: ReturnType<typeof createVisualSurfaceApi> | undefined;
  var LumnoTooltipViewReact: ReturnType<typeof createTooltipViewApi> | undefined;
  var LumnoOnboardingReactBootstrap: {
      reactReady: boolean;
    } | undefined;
  var LumnoOnboardingReactIslands: {
      copyPanel: ReturnType<typeof createCopyPanelApi>;
      cursorLayer: ReturnType<typeof createCursorLayerApi>;
      visualSurface: ReturnType<typeof createVisualSurfaceApi>;
    } | undefined;
}

const runtime = globalThis;

const bootstrapState = runtime.LumnoOnboardingReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  const copyPanelApi = createCopyPanelApi();
  const cursorLayerApi = createCursorLayerApi();
  const visualSurfaceApi = createVisualSurfaceApi();
  const tooltipViewApi = createTooltipViewApi();

  runtime.LumnoOnboardingCopyPanelReact = copyPanelApi;
  runtime.LumnoOnboardingCopyPanel = copyPanelApi;
  runtime.LumnoOnboardingCursorLayerReact = cursorLayerApi;
  runtime.LumnoOnboardingCursorLayer = cursorLayerApi;
  runtime.LumnoOnboardingVisualSurfaceReact = visualSurfaceApi;
  runtime.LumnoOnboardingVisualSurface = visualSurfaceApi;
  runtime.LumnoTooltipViewReact = tooltipViewApi;
  runtime.LumnoTooltipView = tooltipViewApi;
  runtime.LumnoOnboardingReactIslands = Object.freeze({
    copyPanel: copyPanelApi,
    cursorLayer: cursorLayerApi,
    visualSurface: visualSurfaceApi
  });

  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
