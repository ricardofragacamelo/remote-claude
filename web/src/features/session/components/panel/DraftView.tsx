import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { useShortcut } from '@/features/commands';
import { EmptyState } from '@/shared/components/EmptyState';
import { useContextSet } from '../../hooks/useContextSet';
import { useDraft } from '../../hooks/useDraft';
import type { Draft } from '../../hooks/useDraft';
import { unsendable } from '../../lib/context-set';
import { useKnownModels } from '../../store/known-models.store';
import type { InstallationModel } from '../../types/insight';
import { ChatComposer } from '../composer/ChatComposer';
import { ContextDropZone } from '../composer/ContextDropZone';
import type { ComposerBarChoices } from '../composer/ComposerToolbar';
import { EffortPicker, knownModel, ModelPicker, ModePicker } from '../composer/SessionChoices';
import { ChatFrame } from '../frame/ChatFrame';

export interface DraftViewProps {
  readonly folder: string;
  readonly tabKey: string;
}

/** No model the installation listed yet — nothing ran in this folder. */
const NO_MODELS: readonly InstallationModel[] = [];

/**
 * A new conversation, before it is one (plan 08, B-33, D-07): what to start it with — the model, the
 * mode and the effort, in the bar of its box (plan 09, B-11) — and the box whose first prompt opens
 * the session. Nothing runs until then. The effort is chosen here, and only here (S-90).
 *
 * Empty, it teaches (S-196): how the first conversation starts, `@` and `/` in the box, dragging a
 * file in, and the shortcut that comes back here. It is the frame of every conversation (plan 09,
 * B-07): the hints where the conversation will be, and the box anchored under them.
 */
export function DraftView({ folder, tabKey }: DraftViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const draft = useDraft(folder, tabKey, folder);
  const known = useStore(useKnownModels, (state) => state.byFolder[folder]) ?? NO_MODELS;
  const focus = useShortcut('claude.focusComposer');
  const context = useContextSet(folder, tabKey, null);
  const [held, setHeld] = useState(0);

  return (
    <ContextDropZone folder={folder} context={context} fill>
      <ChatFrame
        label={t('sessions.draft.title')}
        dock={
          <ChatComposer
            key={`${String(draft.refusals)}-${String(held)}`}
            disabled={draft.isStarting}
            error={draft.error}
            onSubmit={(text) => {
              // The files are checked before the session is opened: a file gone since it was
              // chosen keeps the draft as it is, with its path said (S-223).
              void context.revalidate().then((items) => {
                const blocked = unsendable(items, context.totals, true);

                if (blocked?.reason === 'missing') {
                  context.say({ key: 'composer.send.missing', params: { path: blocked.path } });
                  draft.setText(text);
                  setHeld((count) => count + 1);
                  return;
                }

                draft.send(text);
              });
            }}
            draft={draft.text}
            onDraftChange={draft.setText}
            submitLabel={draft.isStarting ? t('sessions.draft.starting') : undefined}
            context={context}
            folder={folder}
            sessionId={null}
            pendingUploads
            bar={draftBarOf(draft, known, t)}
          />
        }
      >
        <EmptyState
          title={t('sessions.draft.title')}
          description={t('sessions.draft.description', { shortcut: focus?.label ?? '' })}
        />
        <ul className="flex list-disc flex-col gap-1 pl-5 text-ui-sm text-muted-foreground">
          <li>{t('sessions.draft.mention')}</li>
          <li>{t('sessions.draft.commands')}</li>
          <li>{t('sessions.draft.drag')}</li>
          {known.length === 0 && <li>{t('sessions.draft.defaultModel')}</li>}
        </ul>
      </ChatFrame>
    </ContextDropZone>
  );
}

/** The choices of a draft's bar: the mode, the model and — for a model that takes it — the effort. */
function draftBarOf(
  draft: Draft,
  known: readonly InstallationModel[],
  t: TFunction,
): ComposerBarChoices {
  const choices = (sub: boolean) => (
    <>
      <ModelPicker
        sub={sub}
        models={known}
        current={draft.choices.model}
        onPick={(model) => {
          draft.choose({ model, effort: null });
        }}
      />
      <EffortPicker
        sub={sub}
        model={knownModel(known, draft.choices.model)}
        current={draft.choices.effort}
        onPick={(effort) => {
          draft.choose({ effort });
        }}
      />
    </>
  );

  return {
    label: t('sessions.draft.choices'),
    mode: (
      <ModePicker
        current={draft.choices.mode}
        onPick={(mode) => {
          draft.choose({ mode });
        }}
      />
    ),
    choices: choices(false),
    choicesMenu: choices(true),
  };
}
