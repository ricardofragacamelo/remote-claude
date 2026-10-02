import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

import type { StatusItemProps } from '@/features/workbench';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { STATUS_BAR_ITEM } from '@/shared/components/StatusBarButton';
import {
  EOL_NAMES,
  encodingChoices,
  eolChoices,
  indentationChoices,
  languageChoices,
} from '../hooks/choices';
import { useActiveDocument } from '../hooks/useEditor';
import { activeView } from '../hooks/views';
import { LANGUAGES, PLAIN_TEXT, encodingName } from '../lib/languages';
import type { ChoiceOption } from '../store/choice.store';
import type { FileDocument } from '../types/editor';

interface ChoiceItemProps {
  /** What the item shows — the value in use. */
  readonly text: string;

  /** What pressing it does — its accessible name and its tooltip. Translated. */
  readonly label: string;
  readonly groups: readonly { readonly title: string; readonly options: readonly ChoiceOption[] }[];
}

/** An item that opens a choice: the same options its command offers in the palette (B-37). */
function ChoiceItem({ text, label, groups }: ChoiceItemProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={label} className={STATUS_BAR_ITEM}>
              {text}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
        {groups.map((group, index) => (
          <div key={group.title}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{group.title}</DropdownMenuLabel>
            {group.options.map((option) => (
              <DropdownMenuItem key={option.id} onSelect={option.run}>
                <Check className={option.current ? 'size-4' : 'size-4 opacity-0'} aria-hidden />
                {option.label}
                {option.current && <span className="sr-only">{label}</span>}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What the items say about a file. */
function textsOf(doc: FileDocument, t: TFunction) {
  const size = doc.indentation?.size ?? 4;

  return {
    position: t('editor.status.position', { line: doc.cursor.line, column: doc.cursor.column }),
    selection:
      doc.selectionLength > 0 ? t('editor.status.selection', { count: doc.selectionLength }) : '',
    indentation:
      doc.indentation?.insertSpaces === false
        ? t('editor.status.tabs', { size })
        : t('editor.status.spaces', { size }),
    language:
      doc.language === PLAIN_TEXT
        ? t('editor.language.plaintext')
        : (LANGUAGES[doc.language] ?? doc.language),
  };
}

/** One item that opens a choice: what it shows, what pressing it does, and its options. */
interface StatusChoice extends ChoiceItemProps {
  readonly id: string;
}

/** The items of the status bar that open a choice — each the same as its command in the palette. */
function itemsOf(folder: string, doc: FileDocument, t: TFunction): readonly StatusChoice[] {
  const path = doc.path;
  const { indentation, language } = textsOf(doc, t);
  const encoding = encodingName(doc.encoding);
  const eol = EOL_NAMES[doc.model?.eol() ?? 'lf'];
  const group = (titleKey: string, options: readonly ChoiceOption[]) => ({
    title: t(titleKey),
    options,
  });

  return [
    {
      id: 'indentation',
      text: indentation,
      label: t('editor.status.indentation', { value: indentation }),
      groups: [group('editor.choice.indentation', indentationChoices(folder, path, t))],
    },
    {
      id: 'encoding',
      text: encoding,
      label: t('editor.status.encoding', { value: encoding }),
      groups: [
        group('editor.choice.reopenEncoding', encodingChoices(folder, path, 'reopen')),
        group('editor.choice.saveEncoding', encodingChoices(folder, path, 'save')),
      ],
    },
    {
      id: 'eol',
      text: eol,
      label: t('editor.status.eol', { value: eol }),
      groups: [group('editor.choice.eol', eolChoices(folder, path))],
    },
    {
      id: 'language',
      text: language,
      label: t('editor.status.language', { value: language }),
      groups: [group('editor.choice.language', languageChoices(folder, path, t))],
    },
  ];
}

/**
 * The editor's part of the status bar, for the active tab of the folder on screen (B-37, S-247):
 * line and column with the selection (a press goes to a line), the indentation (convert), the
 * encoding (reopen with, save with), the line ending (convert — which dirties the tab) and the
 * language of the highlighting. Each item is a button with its tooltip; the same actions are in the
 * palette.
 */
export function EditorStatus({ tab }: StatusItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const folder = tab.path;
  const doc = useActiveDocument(folder);

  if (doc === undefined || doc.status !== 'ready' || doc.model === null) {
    return null;
  }

  const { position, selection } = textsOf(doc, t);

  return (
    <div
      className="flex min-w-0 items-center gap-0.5"
      role="group"
      aria-label={t('editor.status.label')}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t('editor.status.goToLine', { position })}
            className={STATUS_BAR_ITEM}
            onClick={() => {
              activeView(folder)?.goToLine();
            }}
          >
            {position}
            {selection !== '' && <span>{selection}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('editor.status.goToLine', { position })}</TooltipContent>
      </Tooltip>
      {itemsOf(folder, doc, t).map((item) => (
        <ChoiceItem key={item.id} text={item.text} label={item.label} groups={item.groups} />
      ))}
    </div>
  );
}
