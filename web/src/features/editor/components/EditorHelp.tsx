import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { useScreenShortcuts } from '@/features/commands';
import { HelpDrawer } from '@/shared/components/HelpDrawer';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { EDITOR_SHORTCUTS } from '../hooks/useEditorCommands';
import { useEditorUiState } from '../hooks/useEditorUiState';

/**
 * The written parts of the editor's help, named in full: the drawer reads them from its prefix, and a
 * check that only sees whole keys has to see these (plan 06, S-94).
 */
export const EDITOR_HELP_PARTS = [
  'editor.help.what',
  'editor.help.states',
  'editor.help.notRecorded',
] as const;

/** The prefix of the help keys — what the parts above start with. */
const EDITOR_HELP = 'editor.help';

/**
 * The help of the editor (B-41), in en and pt-BR, for somebody who never saw the product: what the
 * preview tab is, what the dot of a dirty tab means, what the conflict and a change on disk are, what
 * the light mode leaves out and why a binary file does not open — and the editor's shortcuts, read
 * from the registry (S-264).
 */
export function EditorHelp(): React.JSX.Element {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { helpOpen, setHelpOpen } = useEditorUiState();
  const shortcuts = useScreenShortcuts(EDITOR_SHORTCUTS);
  const headingId = useId();

  return (
    <HelpDrawer
      open={helpOpen}
      onOpenChange={setHelpOpen}
      side={desktop ? 'right' : 'bottom'}
      title={t('editor.screen.title')}
      purpose={t('editor.screen.purpose')}
      help={EDITOR_HELP}
      shortcuts={shortcuts}
      headingId={headingId}
      extra={[
        {
          id: 'previews',
          heading: t('editor.help.previewsHeading'),
          body: (
            <>
              <p>{t('editor.help.previews')}</p>
              <p>{t('editor.help.previewsHtml')}</p>
              <p>{t('editor.help.paged')}</p>
            </>
          ),
        },
      ]}
    />
  );
}
