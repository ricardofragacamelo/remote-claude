import { Download, Eye, FolderUp, Upload } from 'lucide-react';

import { canPreview, openPreview } from '@/features/editor';
import { isOperable } from '../lib/sort';
import type { ExplorerAction } from './explorer-actions';
import type { Explorer } from './useExplorer';

/**
 * The actions of previews and transfer on the tree (B-50, B-52): "Open preview" of a file that has
 * one, and "Upload files here…", "Upload folder here…" and "Download" — in the context menu on the
 * folder or the item clicked, in the palette, and on keys that work with the focus in the tree, so
 * the whole of it is done without a mouse (S-360).
 */
export function transferActions(explorer: Explorer): ExplorerAction[] {
  const { transfer } = explorer;
  const operable = explorer.targets.filter((row) => isOperable(row.entry));
  const single = explorer.targets.length === 1 ? operable[0] : undefined;
  const previewable = single !== undefined && !single.expandable && canPreview(single.path);

  return [
    {
      id: 'explorer.openPreview',
      labelKey: 'explorer.action.openPreview',
      icon: Eye,
      group: 'open',
      available: () => previewable,
      run: () => {
        if (single !== undefined && previewable) {
          openPreview(explorer.folder, single.path);
        }
      },
    },
    {
      id: 'explorer.uploadFiles',
      labelKey: 'explorer.action.uploadFiles',
      icon: Upload,
      group: 'transfer',
      available: () => transfer.upload.step === 'idle',
      run: () => {
        transfer.pick(explorer.targetFolder(), 'files');
      },
      keys: [{ key: 'Alt+U', context: 'explorer' }],
    },
    {
      id: 'explorer.uploadFolder',
      labelKey: 'explorer.action.uploadFolder',
      icon: FolderUp,
      group: 'transfer',
      available: () => transfer.upload.step === 'idle',
      run: () => {
        transfer.pick(explorer.targetFolder(), 'folder');
      },
      keys: [{ key: 'Shift+Alt+U', context: 'explorer' }],
    },
    {
      id: 'explorer.download',
      labelKey: 'explorer.action.download',
      icon: Download,
      group: 'transfer',
      available: () => operable.length > 0 && !transfer.downloading,
      run: () => {
        void transfer.download(operable);
      },
      keys: [{ key: 'Shift+Alt+D', context: 'explorer' }],
    },
  ];
}
