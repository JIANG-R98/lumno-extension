import { createPopupApi } from './popup-view';
import { createTooltipViewApi } from '../../shared/react/tooltip-view';

declare global {
  var LumnoPopupReactBootstrap: {
      reactReady: boolean;
    } | undefined;
}

const runtime = globalThis;

const bootstrapState = runtime.LumnoPopupReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  runtime.LumnoPopupReact = createPopupApi();
  // The shared tooltip (src/shared/ui/tooltip.ts) renders through this view.
  runtime.LumnoTooltipView = createTooltipViewApi();
  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
