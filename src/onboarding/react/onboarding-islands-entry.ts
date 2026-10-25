import { createCopyPanelApi } from './copy-panel';
import { createVisualPanelApi } from './visual-panel';
import { createTooltipViewApi } from '../../shared/react/tooltip-view';

declare global {
  var LumnoOnboardingCopyPanelReact: ReturnType<typeof createCopyPanelApi> | undefined;
  var LumnoOnboardingVisualPanelReact: ReturnType<typeof createVisualPanelApi> | undefined;
  var LumnoTooltipViewReact: ReturnType<typeof createTooltipViewApi> | undefined;
  var LumnoOnboardingReactBootstrap: {
      reactReady: boolean;
    } | undefined;
  var LumnoOnboardingReactIslands: {
      copyPanel: ReturnType<typeof createCopyPanelApi>;
      visualPanel: ReturnType<typeof createVisualPanelApi>;
    } | undefined;
}

const runtime = globalThis;

const bootstrapState = runtime.LumnoOnboardingReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  const copyPanelApi = createCopyPanelApi();
  const visualPanelApi = createVisualPanelApi();
  const tooltipViewApi = createTooltipViewApi();

  runtime.LumnoOnboardingCopyPanelReact = copyPanelApi;
  runtime.LumnoOnboardingCopyPanel = copyPanelApi;
  runtime.LumnoOnboardingVisualPanelReact = visualPanelApi;
  runtime.LumnoOnboardingVisualPanel = visualPanelApi;
  runtime.LumnoTooltipViewReact = tooltipViewApi;
  runtime.LumnoTooltipView = tooltipViewApi;
  runtime.LumnoOnboardingReactIslands = Object.freeze({
    copyPanel: copyPanelApi,
    visualPanel: visualPanelApi
  });

  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
