import { createOnboardingPageApi } from './onboarding-page';
import { createTooltipViewApi } from '../../shared/react/tooltip-view';

declare global {
  var LumnoOnboardingPageReact: ReturnType<typeof createOnboardingPageApi> | undefined;
  var LumnoTooltipViewReact: ReturnType<typeof createTooltipViewApi> | undefined;
  var LumnoOnboardingReactBootstrap: {
      reactReady: boolean;
    } | undefined;
  var LumnoOnboardingReactIslands: {
      page: ReturnType<typeof createOnboardingPageApi>;
    } | undefined;
}

const runtime = globalThis;

const bootstrapState = runtime.LumnoOnboardingReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  const pageApi = createOnboardingPageApi();
  const tooltipViewApi = createTooltipViewApi();

  runtime.LumnoOnboardingPageReact = pageApi;
  runtime.LumnoOnboardingPage = pageApi;
  runtime.LumnoTooltipViewReact = tooltipViewApi;
  runtime.LumnoTooltipView = tooltipViewApi;
  runtime.LumnoOnboardingReactIslands = Object.freeze({
    page: pageApi
  });

  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
