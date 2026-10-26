// An empty-state illustration (shared/ui/empty-state-art.ts). Its ids are
// drawn once per mount, so it renders again only for another scene or size.
import { memo, useMemo } from 'react';
import { describeEmptyStateArt, type EmptyStateArtName } from '../ui/empty-state-art';
import { SvgTree } from './svg-tree';

export const EmptyStateArt = memo(function EmptyStateArt({ name, size }: {
  name: EmptyStateArtName;
  size: number;
}) {
  const node = useMemo(() => describeEmptyStateArt(name, { size }), [name, size]);
  return <SvgTree node={node} />;
});
