import { createPopupApi } from './popup-view';
import { createTooltipViewApi } from '../shared/tooltip-view';

const runtime = globalThis as typeof globalThis & {
  LumnoPopupReactBootstrap?: {
    reactReady: boolean;
  };
  LumnoPopupReact?: ReturnType<typeof createPopupApi>;
  LumnoTooltipView?: ReturnType<typeof createTooltipViewApi>;
};

const bootstrapState = runtime.LumnoPopupReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  runtime.LumnoPopupReact = createPopupApi();
  // The shared tooltip (src/shared/ui/tooltip.js) renders through this view.
  runtime.LumnoTooltipView = createTooltipViewApi();
  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
