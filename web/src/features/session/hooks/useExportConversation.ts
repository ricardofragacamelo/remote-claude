import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppError } from '@/shared/api/errors';
import { toolLabel } from '../lib/tool-labels';
import { exportConversation } from '../services/conversation-export.service';

/** Where an export is. */
export type ExportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly pages: number }
  | { readonly kind: 'failed'; readonly error: AppError };

/** What the button of the export gets. */
export interface ConversationExport {
  readonly state: ExportState;

  /** Reads every page, writes the Markdown and hands it to the browser to save. */
  run(options: { readonly outputs: boolean }): void;
}

/** Hands a text to the browser to save, under `name`. */
function save(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporting a conversation as Markdown (plan 08, B-39, D-20): generated **here**, from the pages of
 * the transcript the person can already read — all of them, newest page first, with how many came so
 * far — and saved only once every page arrived: a failure halfway saves nothing (S-182).
 */
export function useExportConversation(
  conversationId: string | null,
  folder: string,
): ConversationExport {
  const { t } = useTranslation();
  const [state, setState] = useState<ExportState>({ kind: 'idle' });

  const run = useCallback(
    ({ outputs }: { readonly outputs: boolean }) => {
      if (conversationId === null) {
        return;
      }

      const read = async (): Promise<void> => {
        const markdown = await exportConversation(
          conversationId,
          {
            title: t('sessions.export.title', { conversationId }),
            you: t('session.role.user'),
            claude: t('session.role.assistant'),
            thinking: t('sessions.export.thinking'),
            output: t('sessions.export.output'),
            compacted: t('sessions.export.compacted'),
            tool: (tool) => {
              const label = toolLabel(tool, folder, new Set());
              return t(label.key, label.params);
            },
          },
          { outputs },
          (pages) => {
            setState({ kind: 'loading', pages });
          },
        );

        save(markdown, `conversation-${conversationId}.md`);
        setState({ kind: 'idle' });
      };

      read().catch((error: unknown) => {
        setState({ kind: 'failed', error: error as AppError });
      });
    },
    [conversationId, folder, t],
  );

  return { state, run };
}
