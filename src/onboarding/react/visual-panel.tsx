import { CursorLayer, type CursorLayerRenderModel } from './cursor-layer';
import { VisualSurface, type VisualSurfaceRenderModel } from './visual-surface';
import { createReactRootController, type ReactRootController } from '../../shared/react/root-controller';

export interface VisualPanelModel {
  // The slide the visual belongs to; a new slide starts its demo afresh.
  slideId: string;
  kind: string;
  // Null while the slide shows no visual.
  surface: VisualSurfaceRenderModel | null;
  cursor: CursorLayerRenderModel;
  // The visual blurs out before the next slide's comes in.
  exiting: boolean;
}

// The onboarding visual column: the slide's demo and the cursor over it.
export function VisualPanel({ model }: { model: VisualPanelModel }) {
  const exitClassName = model.exiting ? 'is-visual-exit' : '';
  return (
    <>
      <div
        className={['visual-stage', exitClassName].filter(Boolean).join(' ')}
        data-visual-kind={model.kind}
        data-visual-stage=""
        id="onboarding-visual-stage"
      >
        {model.surface ? <VisualSurface key={model.slideId} model={model.surface} /> : null}
      </div>
      <CursorLayer className={exitClassName} model={model.cursor} />
    </>
  );
}

export type VisualPanelController = ReactRootController<VisualPanelModel>;

export function createVisualPanelController(host: HTMLElement | null): VisualPanelController {
  if (host) {
    host.dataset.reactIsland = 'onboarding-visual-panel';
  }
  return createReactRootController(host, (model: VisualPanelModel) => <VisualPanel model={model} />);
}

export function createVisualPanelApi() {
  return Object.freeze({
    implementation: 'react',
    createVisualPanelController
  });
}
