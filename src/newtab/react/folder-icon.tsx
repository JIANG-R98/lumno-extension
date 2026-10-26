// The bookmark folder glyph. The folder morph and color runtimes reshape
// its paths and gradients in place, so it renders again only when the
// folder it stands for changes.
import { memo, useMemo } from 'react';
import { describeFolderIcon } from '../bookmarks/bookmark-folder-icon';
import { SvgTree } from '../../shared/react/svg-tree';

export const FolderIcon = memo(function FolderIcon({ idSuffix, folderId }: {
  // Makes the glyph's filter and gradient ids unique in the document.
  idSuffix: string;
  folderId?: string;
}) {
  const node = useMemo(() => describeFolderIcon(idSuffix, folderId), [idSuffix, folderId]);
  return <SvgTree node={node} />;
});
