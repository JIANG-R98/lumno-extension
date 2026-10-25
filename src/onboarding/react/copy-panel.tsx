import { ActionButtons, type ActionButtonsHandlers, type ActionButtonsModel } from './action-buttons';
import { BodyCopy, type BodyCopyRenderModel } from './body-copy';
import { CopyHeading, type CopyHeadingHandlers, type CopyHeadingRenderModel } from './copy-heading';
import { Interactions, type InteractionsHandlers, type InteractionsRenderModel } from './interactions';
import { PageStrip, type PageStripHandlers, type PageStripRenderModel } from './page-strip';
import { createReactRootController, type ReactRootController } from '../../shared/react/root-controller';

// Where the title and body are in their slide change: sliding out, placed
// to slide in, sliding in, or still.
export type CopySwapPhase = 'exit' | 'enter-start' | 'enter' | null;

export interface CopyPanelModel {
  slideId: string;
  pageStrip: PageStripRenderModel;
  heading: CopyHeadingRenderModel;
  body: BodyCopyRenderModel;
  interactions: InteractionsRenderModel;
  actions: ActionButtonsModel;
  copySwap: CopySwapPhase;
}

export type CopyPanelHandlers = PageStripHandlers & CopyHeadingHandlers & InteractionsHandlers & ActionButtonsHandlers;

function getSwapClassName(phase: CopySwapPhase): string {
  switch (phase) {
    case 'exit':
      return 't-copy-swap is-exit';
    case 'enter-start':
      return 't-copy-swap is-enter-start';
    case 'enter':
      return 't-copy-swap';
    case null:
      return '';
  }
}

// The onboarding copy column: the step strip, the slide's heading and body,
// its interaction rows and its buttons.
export function CopyPanel({ model, handlers }: { model: CopyPanelModel; handlers: CopyPanelHandlers }) {
  const swapClassName = getSwapClassName(model.copySwap);
  return (
    <>
      <div aria-hidden="true" className="onboarding-newtab-watermark">
        <span className="onboarding-newtab-watermark__solid" />
        <img
          alt=""
          className="onboarding-newtab-watermark__image"
          decoding="async"
          draggable={false}
          height="25.1557"
          loading="eager"
          src="../../assets/images/lumno-wordmark.svg"
          width="112"
        />
      </div>
      <div className="copy-block">
        <PageStrip handlers={handlers} model={model.pageStrip} />
        <CopyHeading handlers={handlers} model={model.heading} titleClassName={swapClassName} />
        <BodyCopy className={swapClassName} model={model.body} />
      </div>
      <Interactions handlers={handlers} model={model.interactions} />
      <ActionButtons actions={model.actions} handlers={handlers} />
    </>
  );
}

export type CopyPanelController = ReactRootController<CopyPanelModel>;

export function createCopyPanelController(host: HTMLElement | null, handlers: CopyPanelHandlers): CopyPanelController {
  if (host) {
    host.dataset.reactIsland = 'onboarding-copy-panel';
  }
  const view = createReactRootController(host, (model: CopyPanelModel) => <CopyPanel handlers={handlers} model={model} />);
  return Object.freeze({
    render(model: CopyPanelModel) {
      if (host) {
        host.dataset.slideId = model.slideId;
      }
      view.render(model);
    },
    destroy: view.destroy
  });
}

export function createCopyPanelApi() {
  return Object.freeze({
    implementation: 'react',
    createCopyPanelController
  });
}
