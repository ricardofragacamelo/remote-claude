import { useCommands } from '@/features/commands';
import { OpenEditors } from '@/features/editor';
import { Timeline } from '@/features/file-history';
import { asCommands, explorerActions } from '../hooks/explorer-actions';
import { useExplorer } from '../hooks/useExplorer';
import { DeleteDialog } from './DeleteDialog';
import { ExplorerBody } from './ExplorerBody';
import { ExplorerHelp } from './ExplorerHelp';
import { ExplorerNotices } from './ExplorerNotices';
import { ExplorerToolbar } from './ExplorerToolbar';
import { MoveToDialog } from './MoveToDialog';
import { OutcomeDialog } from './OutcomeDialog';
import { SensitiveDialog } from './SensitiveDialog';
import { TemplateDialog } from './TemplateDialog';
import { UploadDialog } from './UploadDialog';
import { UploadPickers } from './UploadPickers';
import { UploadProgress } from './UploadProgress';

export interface ExplorerViewProps {
  /** The real path of the folder of the tab. */
  readonly folder: string;
}

/**
 * The Explorer view of the workbench (plan 07, F4): the open editors, then the tree of the folder of
 * the tab with every function on its files — in the context menu, in the palette and the File menu,
 * and on a shortcut (S-180) — the Timeline of the local history (F8), and the dialogs those functions
 * open.
 *
 * Everything in it is the tab's: another folder tab has an Explorer of its own (S-160).
 */
export function ExplorerView({ folder }: ExplorerViewProps): React.JSX.Element {
  const explorer = useExplorer(folder);
  const actions = explorerActions(explorer);

  useCommands(asCommands(actions));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ExplorerToolbar explorer={explorer} actions={actions} />
      <OpenEditors folder={folder} />
      <ExplorerNotices explorer={explorer} />
      <UploadProgress transfer={explorer.transfer} />
      <ExplorerBody explorer={explorer} actions={actions} />
      <Timeline folder={folder} />

      <DeleteDialog flow={explorer.deletion} />
      <MoveToDialog explorer={explorer} />
      <TemplateDialog explorer={explorer} />
      <OutcomeDialog outcome={explorer.runner.outcome} onClose={explorer.runner.closeOutcome} />
      <SensitiveDialog runner={explorer.runner} />
      <UploadDialog transfer={explorer.transfer} />
      <UploadPickers transfer={explorer.transfer} />
      <ExplorerHelp explorer={explorer} />
    </div>
  );
}
