import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { sensitiveSubject } from '@/shared/lib/sensitive-files';
import type { SensitiveSubject } from '@/shared/lib/sensitive-files';
import {
  answerRecreate,
  answerSensitive,
  compareWithDisk,
  discardAndReload,
  overwrite,
  postponeConflict,
} from '../hooks/answers';
import { baseName } from '../lib/paths';
import { AskedDialog } from './AskedDialog';
import type { FileQuestionProps } from './AskedDialog';
import { EditorQuestion } from './EditorQuestion';

/**
 * The questions the editor asks about one file — the conflict of a save (S-228), the second step of
 * a file that changes what Claude may do (S-232), and the file deleted under its tab (S-240) — each in
 * a dialog of its own, one at a time, the way out with the focus first.
 */
export function FileQuestions({ folder }: { readonly folder: string }): React.JSX.Element {
  return (
    <>
      <AskedDialog folder={folder} kind="conflict" question={ConflictQuestion} />
      <AskedDialog folder={folder} kind="sensitive" question={SensitiveQuestion} />
      <AskedDialog folder={folder} kind="recreate" question={RecreateQuestion} />
    </>
  );
}

/**
 * The conflict: the file changed on disk since it was opened — Claude's work, probably — and a save
 * would overwrite it. Compare (a diff tab of the disk and the buffer), Overwrite (on purpose, over the
 * version shown), or Reload (dropping the changes). Nothing is ever overwritten on its own.
 */
function ConflictQuestion({ folder, path }: FileQuestionProps): React.JSX.Element {
  const { t } = useTranslation();
  const start = useRef<HTMLButtonElement>(null);
  const name = baseName(path);

  return (
    <EditorQuestion
      folder={folder}
      open
      title={t('editor.conflict.title', { name })}
      description={t('editor.conflict.description', { name })}
      start={start}
      onDismiss={() => {
        postponeConflict(folder, path);
      }}
      footer={
        <>
          <Button
            ref={start}
            variant="outline"
            onClick={() => {
              compareWithDisk(folder, path);
            }}
          >
            {t('editor.conflict.compare')}
          </Button>
          <Button variant="outline" onClick={() => void discardAndReload(folder, path)}>
            {t('editor.conflict.reload')}
          </Button>
          <Button variant="destructive" onClick={() => void overwrite(folder, path)}>
            {t('editor.conflict.overwrite')}
          </Button>
        </>
      }
    >
      {null}
    </EditorQuestion>
  );
}

/** What a sensitive file controls, said before the save — the subject's own key, named in full. */
const SUBJECTS: Readonly<Record<SensitiveSubject, string>> = {
  claudeSettings: 'editor.sensitive.claudeSettings',
  claudeLocalSettings: 'editor.sensitive.claudeLocalSettings',
  mcpServers: 'editor.sensitive.mcpServers',
};

/** What a file the server called sensitive, and the list did not know, controls: Claude's settings. */
const UNKNOWN_SUBJECT: SensitiveSubject = 'claudeSettings';

/** The questions answered by yes or no — each one's words, and what "yes" does. */
const YES_NO = {
  sensitive: {
    titleKey: 'editor.sensitive.title',
    noKey: 'editor.sensitive.cancel',
    yesKey: 'editor.sensitive.confirm',
    risky: true,
    answer: answerSensitive,
  },
  recreate: {
    titleKey: 'editor.recreate.title',
    noKey: 'editor.recreate.cancel',
    yesKey: 'editor.recreate.confirm',
    risky: false,
    answer: answerRecreate,
  },
} as const;

/**
 * A question answered by yes or no, "no" with the focus first and what `Esc` means: the second step
 * of a file that changes what Claude may do — what it controls, before the save goes with
 * `confirmSensitive` — or recreating a file deleted on disk, a create, never a silent save.
 */
function YesNo({
  folder,
  path,
  kind,
}: FileQuestionProps & { readonly kind: keyof typeof YES_NO }): React.JSX.Element {
  const { t } = useTranslation();
  const start = useRef<HTMLButtonElement>(null);
  const question = YES_NO[kind];
  const subject = sensitiveSubject(path);
  const answered = (confirmed: boolean) => () => void question.answer(folder, path, confirmed);
  const description =
    kind === 'sensitive'
      ? t(SUBJECTS[subject ?? UNKNOWN_SUBJECT])
      : t('editor.recreate.description', { path });

  return (
    <EditorQuestion
      folder={folder}
      open
      title={t(question.titleKey, { path, name: baseName(path) })}
      description={description}
      start={start}
      onDismiss={answered(false)}
      footer={
        <>
          <Button ref={start} variant="outline" onClick={answered(false)}>
            {t(question.noKey)}
          </Button>
          <Button variant={question.risky ? 'destructive' : 'primary'} onClick={answered(true)}>
            {t(question.yesKey)}
          </Button>
        </>
      }
    >
      {(kind === 'sensitive' || subject !== null) && (
        <p className="text-ui">{t('editor.sensitive.warning')}</p>
      )}
    </EditorQuestion>
  );
}

function SensitiveQuestion(props: FileQuestionProps): React.JSX.Element {
  return <YesNo {...props} kind="sensitive" />;
}

function RecreateQuestion(props: FileQuestionProps): React.JSX.Element {
  return <YesNo {...props} kind="recreate" />;
}
