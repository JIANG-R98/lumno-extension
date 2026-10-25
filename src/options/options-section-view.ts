// The view a settings section draws itself through: a React root of its
// own, or its part of a tab's one view.
interface SectionView<M> {
  render(model: M): void;
  destroy(): void;
}

export type { SectionView };
