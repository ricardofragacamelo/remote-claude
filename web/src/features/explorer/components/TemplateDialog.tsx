import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { FILE_TEMPLATES } from '../lib/templates';
import type { Explorer } from '../hooks/useExplorer';
import { DialogFrame } from '@/shared/components/DialogFrame';

export interface TemplateDialogProps {
  readonly explorer: Explorer;
}

/**
 * "New from template" — the templates built into the web (07 · D-19), each by its translated name
 * and the name it suggests. Picking one names the new file in place, with the extension already
 * there (S-169).
 */
export function TemplateDialog({ explorer }: TemplateDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const picked = useRef(false);
  const close = (): void => {
    explorer.chooseTemplate(false);
  };

  return (
    <DialogFrame
      open={explorer.choosingTemplate}
      onClose={close}
      title={t('explorer.template.title')}
      description={t('explorer.template.description')}
      onCloseAutoFocus={(event) => {
        // A template picked: the focus goes to the name being typed, not back to the opener.
        if (picked.current) {
          picked.current = false;
          event.preventDefault();
        }
      }}
      footer={
        <Button variant="outline" onClick={close}>
          {t('explorer.template.cancel')}
        </Button>
      }
    >
      <ul aria-label={t('explorer.template.listLabel')} className="flex flex-col gap-1">
        {FILE_TEMPLATES.map((template) => (
          <li key={template.id}>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => {
                picked.current = true;
                close();
                explorer.newEntry('file', template.id);
              }}
            >
              <span>{t(template.labelKey)}</span>
              <span className="font-code text-ui-sm text-muted-foreground">
                {template.suggestedName}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </DialogFrame>
  );
}
