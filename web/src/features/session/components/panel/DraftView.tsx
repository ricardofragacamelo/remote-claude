import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { useShortcut } from '@/features/commands';
import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { useDraft } from '../../hooks/useDraft';
import { useKnownModels } from '../../store/known-models.store';
import { PromptComposer } from '../PromptComposer';
import { EffortPicker, ModelPicker, ModePicker } from './SessionChoices';

export interface DraftViewProps {
  readonly folder: string;
  readonly tabKey: string;
}

/**
 * A new conversation, before it is one (plan 08, B-33, D-07): what to start it with — the model, the
 * mode and the effort — and the box whose first prompt opens the session. Nothing runs until then.
 *
 * Empty, it teaches (S-196): how the first conversation starts, `@` and `/` in the box, dragging a
 * file in, and the shortcut that comes back here.
 */
export function DraftView({ folder, tabKey }: DraftViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const draft = useDraft(folder, tabKey, folder);
  const known = useStore(useKnownModels, (state) => state.byFolder[folder]) ?? [];
  const chosen = known.find((model) => model.value === draft.choices.model);
  const focus = useShortcut('claude.focusComposer');

  return (
    <div className="flex flex-col gap-3">
      <EmptyState
        title={t('sessions.draft.title')}
        description={t('sessions.draft.description', { shortcut: focus?.label ?? '' })}
      />
      <ul className="flex list-disc flex-col gap-1 pl-5 text-ui-sm text-muted-foreground">
        <li>{t('sessions.draft.mention')}</li>
        <li>{t('sessions.draft.commands')}</li>
        <li>{t('sessions.draft.drag')}</li>
      </ul>

      <div
        className="flex flex-wrap items-start gap-1"
        role="group"
        aria-label={t('sessions.draft.choices')}
      >
        <ModelPicker
          models={known}
          current={draft.choices.model}
          onPick={(model) => {
            draft.choose({ model, effort: null });
          }}
        />
        <ModePicker
          current={draft.choices.mode}
          onPick={(mode) => {
            draft.choose({ mode });
          }}
        />
        <EffortPicker
          model={chosen}
          current={draft.choices.effort}
          onPick={(effort) => {
            draft.choose({ effort });
          }}
        />
      </div>
      {known.length === 0 && (
        <p className="text-ui-xs text-muted-foreground">{t('sessions.draft.defaultModel')}</p>
      )}

      {draft.error !== null && <ErrorState error={draft.error} />}

      <PromptComposer
        key={draft.refusals}
        disabled={draft.isStarting}
        onSubmit={draft.send}
        draft={draft.text}
        onDraftChange={draft.setText}
        submitLabel={draft.isStarting ? t('sessions.draft.starting') : undefined}
      />
    </div>
  );
}
