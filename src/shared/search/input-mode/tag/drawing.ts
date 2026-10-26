// Draws the mode tag and the Tab hint: the React view
// (react/search/mode-tag.tsx) shows their models, kept here. Each change
// commits before it returns, so the tag can be measured and animated at once.
import type { ModeTagHandlers, ModeTagView, TabHintView } from '../../../react/search/mode-tag';
import { EMPTY_MODE_TAG } from '../mode-tag-model';
import type { ModeTagModel, TabHintModel } from '../mode-tag-model';

interface ModeTagViews {
  modeTagView: ModeTagView;
  tabHintView: TabHintView;
}

class ModeTagDrawing {
  private tagModel: ModeTagModel = EMPTY_MODE_TAG;
  private hintModel: TabHintModel = { visible: false, label: '', title: '' };
  private readonly views: ModeTagViews;
  private readonly handlers: ModeTagHandlers;

  constructor(views: ModeTagViews, handlers: ModeTagHandlers) {
    this.views = views;
    this.handlers = handlers;
  }

  get model(): ModeTagModel {
    return this.tagModel;
  }

  get tabHint(): TabHintModel {
    return this.hintModel;
  }

  update(patch: Partial<ModeTagModel>): void {
    this.tagModel = { ...this.tagModel, ...patch };
    this.views.modeTagView.render(this.tagModel, this.handlers);
  }

  updateTabHint(patch: Partial<TabHintModel>): void {
    this.hintModel = { ...this.hintModel, ...patch };
    this.views.tabHintView.render(this.hintModel);
  }
}

export type { ModeTagViews };
export { ModeTagDrawing };
