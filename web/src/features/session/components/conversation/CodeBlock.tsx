import { useEffect, useState } from 'react';
import { ClipboardCopy, TextCursorInput } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { colorizeCode, insertIntoEditor, useInsertBlocker } from '@/features/editor';
import type { CodeToken } from '@/features/editor';
import { IconButton } from '@/shared/components/IconButton';
import { useCopy } from '@/shared/hooks/useCopy';

/** What the insert button says: what it does, or why it cannot now (S-68). */
const BLOCKED = {
  none: 'sessions.code.insert',
  noEditor: 'sessions.code.insertNoEditor',
  notLoaded: 'sessions.code.insertNotLoaded',
} as const;

export interface CodeBlockProps {
  readonly code: string;

  /** The language its fence named — `''` for none. */
  readonly language: string;

  /** The folder of the tab — whose editor "insert" writes into. `''` for none. */
  readonly folder: string;
}

/**
 * A block of code of Claude's answer (plan 08, B-15): coloured as the editor colours its language,
 * loaded on demand — monospaced when it names none the editor knows (S-65) — with "copy", which
 * copies it exactly and says so (S-66), and "insert in the editor", which puts it at the cursor of the
 * editor of the same tab and leaves the file dirty, never saved (S-67). With no editor open, insert
 * is disabled with the reason (S-68).
 */
export function CodeBlock({ code, language, folder }: CodeBlockProps): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useCopy(code);
  const blocker = useInsertBlocker(folder);
  const [coloured, setColoured] = useState<CodeToken[][] | null>(null);

  useEffect(() => {
    let live = true;
    void colorizeCode(code, language).then(
      (lines) => {
        if (live) setColoured(lines);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [code, language]);

  return (
    <div className="group relative">
      <div className="absolute top-1 right-1 flex gap-1 opacity-80 group-hover:opacity-100">
        <IconButton
          icon={ClipboardCopy}
          label={t('sessions.code.copy')}
          onClick={() => {
            copy.copy();
          }}
        />
        <IconButton
          icon={TextCursorInput}
          label={t(BLOCKED[blocker ?? 'none'])}
          aria-disabled={blocker !== null}
          onClick={() => {
            if (blocker === null) {
              insertIntoEditor(folder, code);
            }
          }}
        />
      </div>
      <pre
        className="overflow-x-auto rounded-md bg-muted p-3 font-code text-ui-sm"
        data-language={language}
      >
        <code>{coloured === null ? code : <Coloured lines={coloured} />}</code>
      </pre>
      <span role="status" className="sr-only">
        {copy.state === 'copied' ? t('sessions.code.copied') : ''}
        {copy.state === 'failed' ? t('sessions.code.copyFailed') : ''}
      </span>
    </div>
  );
}

/** The coloured lines: runs of text with the class the editor's theme colours — text, never HTML. */
function Coloured({ lines }: { readonly lines: CodeToken[][] }): React.JSX.Element {
  return (
    <>
      {lines.map((line, index) => (
        <span key={index} className="block">
          {line.map((token, at) => (
            <span key={at} className={token.className}>
              {token.text}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}
