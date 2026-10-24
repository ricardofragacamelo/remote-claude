import { useTranslation } from 'react-i18next';

import { ConfirmFooterButtons } from '@/shared/components/ConfirmFooterButtons';
import { DialogFrame } from '@/shared/components/DialogFrame';
import type { SkillToggleFlow } from '../hooks/useSkillToggleFlow';

export interface EnableOriginDialogProps {
  readonly flow: SkillToggleFlow;
}

/**
 * "Turn on this origin?" — shown only for turning *on* a toggleable origin (D-20's asymmetry: turning
 * one off needs no question), with the exact list of skills about to start loading, computed off what
 * the screen already has on hand (plan 13, B-34, S-182).
 */
export function EnableOriginDialog({ flow }: EnableOriginDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const origin = flow.pendingOrigin;
  const open = origin !== null;

  const descriptionKey =
    origin === 'system'
      ? 'engines.claude.skills.enableOriginDescriptionSystem'
      : 'engines.claude.skills.enableOriginDescriptionUser';
  const originLabel =
    origin === null
      ? ''
      : t(
          origin === 'system'
            ? 'engines.claude.skills.originSystem'
            : 'engines.claude.skills.originUser',
        );

  return (
    <DialogFrame
      open={open}
      onClose={flow.cancelEnableOrigin}
      title={t('engines.claude.skills.enableOriginTitle', { origin: originLabel })}
      description={t(descriptionKey)}
      footer={
        <ConfirmFooterButtons
          keys={{
            cancel: 'engines.claude.skills.enableOriginCancel',
            confirm: 'engines.claude.skills.enableOriginConfirm',
            busy: 'engines.claude.skills.enableOriginConfirm',
          }}
          busy={flow.busy}
          onCancel={flow.cancelEnableOrigin}
          onConfirm={flow.confirmEnableOrigin}
        />
      }
    >
      {flow.aboutToLoad.length === 0 ? (
        <p className="text-ui-sm text-muted-foreground">
          {t('engines.claude.skills.enableOriginListEmpty')}
        </p>
      ) : (
        <ul
          aria-label={t('engines.claude.skills.enableOriginListLabel')}
          className="flex flex-col gap-1 text-ui"
        >
          {flow.aboutToLoad.map((skill) => (
            <li key={skill.name}>{skill.name}</li>
          ))}
        </ul>
      )}
    </DialogFrame>
  );
}
