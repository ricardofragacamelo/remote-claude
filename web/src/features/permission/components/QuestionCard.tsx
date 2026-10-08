import { createContext, lazy, Suspense, use, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { useArrivalFocus } from '../hooks/useArrivalFocus';
import {
  EMPTY_DRAFT,
  allAnswered,
  answersOf,
  choose,
  chosenOf,
  isAnswered,
  isRecommended,
  onStep,
  otherOf,
  toggleOther,
  writeOther,
} from '../lib/question-draft';
import { PermissionCountdown } from './PermissionCountdown';
import type {
  PermissionRequest,
  Question,
  QuestionAnswer,
  QuestionDraft,
  QuestionInteraction,
} from '../types/permission';

/** The renderer of markdown, on demand — a preview is the only thing here that needs it. */
const Markdown = lazy(() =>
  import('@/shared/components/markdown/Markdown').then((module) => ({ default: module.Markdown })),
);

export interface QuestionCardProps {
  readonly request: PermissionRequest;
  readonly interaction: QuestionInteraction;

  /** Milliseconds left before the deadline refuses it. */
  readonly remainingMs: number;

  /** What was chosen so far — kept by request, outside the card, so a reconnect never loses it. */
  readonly draft: QuestionDraft | undefined;
  onDraft(requestId: string, draft: QuestionDraft): void;
  onSubmit(request: PermissionRequest, answers: readonly QuestionAnswer[]): void;

  /** Not answering, with what the person wrote — empty when they wrote nothing. */
  onDecline(request: PermissionRequest, reason: string): void;
  onExtend(request: PermissionRequest): void;
}

/**
 * A question of Claude (`AskUserQuestion`), answered (plan 24, B-14) — the card of the extension of
 * the VS Code, the mould of plans 09 and 10 (docs/architecture/web/03-ui-system.md#a-pergunta--questioncard):
 *
 * - **one question at a time**, in tabs named by their header, each marked once it has an answer;
 * - a **single choice** is a radio, and choosing one that is not the last goes on to the next by
 *   itself; a **multiple** one is a checkbox, and stays (D-24);
 * - **"Other"** is always the last option, and opens a field; marked and empty, it is no answer;
 * - the option Claude **recommends** is highlighted, never chosen for the person (D-23);
 * - a **preview**, on a single choice that has any, beside the options — stacked on a narrow screen;
 * - **"Send answers"** waits for every question (D-04); **"Don't answer"** and Esc refuse, with a
 *   reason the person may leave empty (D-15). There is no "allow" here, no scope and no reach.
 *
 * It is answered, not authorised: the focus arrives on the first option, not on a refusal.
 */
export function QuestionCard(props: QuestionCardProps): React.JSX.Element {
  const { request, interaction, remainingMs, onExtend } = props;
  const { t } = useTranslation();
  const [declining, setDeclining] = useState(false);
  // Whether the focus follows the question on screen: yes when the arrows or a choice moved it, no
  // when a tab was clicked — the tab keeps it, as a tab list does.
  const [follow, setFollow] = useState(false);
  const self = useRef<HTMLLIElement>(null);
  const draft = props.draft ?? EMPTY_DRAFT;
  const ready = !interaction.malformed && allAnswered(interaction, draft);
  const save = (next: QuestionDraft): void => {
    props.onDraft(request.requestId, next);
  };
  const submit = (): void => {
    if (ready && !request.isAnswering) {
      props.onSubmit(request, answersOf(interaction, draft));
    }
  };

  return (
    <li
      data-permission-request={request.requestId}
      ref={self}
      data-question-card
      tabIndex={-1}
      aria-label={t('permission.question.label')}
      className="flex flex-col gap-3 rounded-lg border-2 border-primary p-4 outline-ring focus-visible:outline-2"
    >
      <CardKeysContext
        value={{
          submit,
          decline: () => {
            setDeclining(true);
          },
          step: (by) => {
            setFollow(true);
            save(onStep(draft, clampStep(draft.step + by, interaction)));
          },
          walk: (by) => {
            if (self.current !== null) {
              walkOptions(self.current, by);
            }
          },
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('permission.tool.AskUserQuestion')}</h3>
          <PermissionCountdown remainingMs={remainingMs} />
        </div>

        {interaction.malformed && <p className="text-sm">{t('permission.question.malformed')}</p>}

        {declining || interaction.malformed ? (
          <DeclineForm
            disabled={request.isAnswering}
            canGoBack={!interaction.malformed}
            onConfirm={(reason) => {
              props.onDecline(request, reason);
            }}
            onBack={() => {
              setDeclining(false);
            }}
          />
        ) : (
          <>
            <Questions
              request={request}
              interaction={interaction}
              draft={draft}
              follow={follow}
              onFollow={setFollow}
              onDraft={save}
              onLastOther={submit}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="touch" disabled={!ready || request.isAnswering} onClick={submit}>
                {t('permission.question.submit')}
              </Button>
              <Button
                variant="outline"
                size="touch"
                disabled={request.isAnswering}
                onClick={() => {
                  setDeclining(true);
                }}
              >
                {t('permission.question.decline')}
              </Button>
              <Button
                variant="outline"
                size="touch"
                disabled={request.isAnswering}
                onClick={() => {
                  onExtend(request);
                }}
              >
                {t('permission.card.extend')}
              </Button>
            </div>
          </>
        )}

        {request.isAnswering && (
          <p className="text-xs opacity-70">{t('permission.card.sending')}</p>
        )}
      </CardKeysContext>
    </li>
  );
}

/** What the keys of the card do. */
interface CardKeys {
  submit(): void;
  decline(): void;
  step(by: number): void;

  /** Moves the focus along the options of the question on screen. */
  walk(by: number): void;
}

/**
 * The keys of the card, for the elements that take them — the options, the tabs, the field of
 * "Other": the card itself is not something a person types into.
 */
const CardKeysContext = createContext<CardKeys>({
  submit: () => undefined,
  decline: () => undefined,
  step: () => undefined,
  walk: () => undefined,
});

/** What a key pressed on an element of the card does, when the card is there to say. */
function useCardKeys(): (event: KeyboardEvent<HTMLElement>) => void {
  const keys = use(CardKeysContext);

  return (event) => {
    cardKey(event, keys);
  };
}

/**
 * The keyboard of the card (S-74): ← and → go from question to question, ↑ and ↓ walk the options,
 * Enter marks the one in focus, Ctrl/⌘+Enter sends, and Esc refuses. Inside the field of "Other",
 * the arrows and Enter are the field's.
 */
function cardKey(event: KeyboardEvent<HTMLElement>, keys: CardKeys): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    keys.decline();
    return;
  }

  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    keys.submit();
    return;
  }

  if (isTyping(event.target)) {
    return;
  }

  optionKey(event, keys);
}

/** The keys that move between questions and options, and Enter on an option. */
function optionKey(event: KeyboardEvent<HTMLElement>, keys: CardKeys): void {
  const moves: Readonly<Record<string, () => void>> = {
    ArrowLeft: () => {
      keys.step(-1);
    },
    ArrowRight: () => {
      keys.step(1);
    },
    ArrowUp: () => {
      keys.walk(-1);
    },
    ArrowDown: () => {
      keys.walk(1);
    },
    Enter: () => {
      if (event.target instanceof HTMLInputElement) {
        event.target.click();
      }
    },
  };

  const move = moves[event.key];
  if (move !== undefined) {
    event.preventDefault();
    move();
  }
}

/** Whether a key is being typed into a field — the free answer, or the reason. */
function isTyping(target: EventTarget): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type === 'text')
  );
}

/** Moves the focus to the next or the previous option of the question on screen, in a ring. */
function walkOptions(card: HTMLElement, by: number): void {
  const options = [...card.querySelectorAll<HTMLInputElement>('[data-question-option]')];
  const at = options.findIndex((option) => option === document.activeElement);
  const next = options[(at + by + options.length) % options.length];

  next?.focus();
}

/** A step that exists: the first and the last are as far as the arrows go. */
function clampStep(step: number, interaction: QuestionInteraction): number {
  return Math.min(Math.max(step, 0), interaction.questions.length - 1);
}

interface QuestionsProps {
  readonly request: PermissionRequest;
  readonly interaction: QuestionInteraction;
  readonly draft: QuestionDraft;

  /** Whether the focus goes with the question on screen. */
  readonly follow: boolean;
  onFollow(follow: boolean): void;
  onDraft(draft: QuestionDraft): void;

  /** Enter in the free answer of the last question: send, when everything is answered. */
  onLastOther(): void;
}

/** The tabs, and the question on screen. */
function Questions({
  request,
  interaction,
  draft,
  follow,
  onFollow,
  onDraft,
  onLastOther,
}: QuestionsProps): React.JSX.Element {
  const { t } = useTranslation();
  const step = clampStep(draft.step, interaction);
  const question = interaction.questions[step];
  const panelId = `question-panel-${request.requestId}`;

  return (
    <>
      {interaction.questions.length > 1 && (
        <div
          role="tablist"
          aria-label={t('permission.question.tabs')}
          className="flex flex-wrap gap-1"
        >
          {interaction.questions.map((each, index) => (
            <QuestionTab
              key={each.id}
              question={each}
              selected={index === step}
              answered={isAnswered(draft, each)}
              panelId={panelId}
              onSelect={() => {
                onFollow(false);
                onDraft(onStep(draft, index));
              }}
            />
          ))}
        </div>
      )}
      {question !== undefined && (
        <QuestionPanel
          key={question.id}
          id={panelId}
          request={request}
          question={question}
          follow={follow}
          label={t('permission.question.progress', {
            n: step + 1,
            total: interaction.questions.length,
          })}
          draft={draft}
          onDraft={(next, advance) => {
            const last = step === interaction.questions.length - 1;
            // A single choice that is not the last goes on by itself, as in the extension (D-24).
            if (advance && !last) {
              onFollow(true);
              onDraft(onStep(next, step + 1));
            } else {
              onDraft(next);
            }
          }}
          onEnterOther={() => {
            if (step === interaction.questions.length - 1) {
              onLastOther();
            } else {
              onFollow(true);
              onDraft(onStep(draft, step + 1));
            }
          }}
        />
      )}
    </>
  );
}

/** One tab: the header of its question, marked once it has an answer. */
function QuestionTab({
  question,
  selected,
  answered,
  panelId,
  onSelect,
}: {
  readonly question: Question;
  readonly selected: boolean;
  readonly answered: boolean;
  readonly panelId: string;
  onSelect(): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const onKey = useCardKeys();

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKey}
      className={cn(
        'flex items-center gap-1 rounded-full border px-3 py-1 text-xs',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
      )}
    >
      {answered && <Check className="size-3" aria-hidden />}
      <span>{question.header === '' ? question.id : question.header}</span>
      {answered && (
        <>
          {' '}
          <span className="sr-only">{t('permission.question.answered')}</span>
        </>
      )}
    </button>
  );
}

interface QuestionPanelProps {
  readonly id: string;
  readonly request: PermissionRequest;
  readonly question: Question;

  /** The focus arrives here with the question — it moved by the arrows or by a choice. */
  readonly follow: boolean;
  readonly label: string;
  readonly draft: QuestionDraft;

  /** @param advance a single choice was made, which goes on to the next question */
  onDraft(draft: QuestionDraft, advance: boolean): void;
  onEnterOther(): void;
}

/** The question on screen: its text, its options, "Other", and the preview beside them. */
function QuestionPanel({
  id,
  request,
  question,
  follow,
  label,
  draft,
  onDraft,
  onEnterOther,
}: QuestionPanelProps): React.JSX.Element {
  const [peek, setPeek] = useState<string | null>(null);
  const promptId = `${id}-prompt`;
  const first = useArrivalFocus<HTMLInputElement>(request.requestId, true);

  useEffect(() => {
    if (follow) {
      first.current?.focus();
    }
  }, [follow, first]);

  const previews = !question.multiSelect && question.options.some((o) => o.preview !== null);
  const shown = peek ?? chosenOf(draft, question)[0] ?? question.options[0]?.label ?? null;

  return (
    <div role="tabpanel" id={id} aria-label={label} className="flex flex-col gap-2">
      <p id={promptId} className="text-sm font-medium whitespace-pre-wrap">
        {question.prompt}
      </p>
      <div className={cn('grid gap-3', previews && 'md:grid-cols-2')}>
        <Options
          question={question}
          promptId={promptId}
          draft={draft}
          disabled={request.isAnswering}
          firstRef={first}
          onPeek={setPeek}
          onDraft={onDraft}
          onEnterOther={onEnterOther}
        />
        {previews && <PreviewPane question={question} label={shown} />}
      </div>
    </div>
  );
}

interface OptionsProps {
  readonly question: Question;
  readonly promptId: string;
  readonly draft: QuestionDraft;
  readonly disabled: boolean;
  readonly firstRef: RefObject<HTMLInputElement | null>;
  onPeek(label: string | null): void;
  onDraft(draft: QuestionDraft, advance: boolean): void;
  onEnterOther(): void;
}

/** The options of a question, and "Other" last: radios on a single choice, checkboxes on a multiple. */
function Options({
  question,
  promptId,
  draft,
  disabled,
  firstRef,
  onPeek,
  onDraft,
  onEnterOther,
}: OptionsProps): React.JSX.Element {
  const { t } = useTranslation();
  const type = question.multiSelect ? 'checkbox' : 'radio';
  const chosen = chosenOf(draft, question);
  const other = otherOf(draft, question);

  return (
    <div
      role={question.multiSelect ? 'group' : 'radiogroup'}
      aria-labelledby={promptId}
      className="flex flex-col gap-1"
    >
      {question.options.map((option, index) => (
        <OptionItem
          key={option.label}
          name={`question-${question.id}`}
          type={type}
          label={option.label}
          description={option.description}
          checked={chosen.includes(option.label)}
          disabled={disabled}
          inputRef={index === 0 ? firstRef : undefined}
          onPeek={onPeek}
          onChange={() => {
            onDraft(choose(draft, question, option.label), !question.multiSelect);
          }}
        />
      ))}
      <OptionItem
        name={`question-${question.id}`}
        type={type}
        label={t('permission.question.other')}
        description=""
        checked={other !== null}
        disabled={disabled}
        onPeek={onPeek}
        onChange={() => {
          onDraft(toggleOther(draft, question), false);
        }}
      />
      {other !== null && (
        <OtherField
          value={other}
          disabled={disabled}
          onChange={(text) => {
            onDraft(writeOther(draft, question, text), false);
          }}
          onEnter={onEnterOther}
        />
      )}
    </div>
  );
}

interface OptionItemProps {
  readonly name: string;
  readonly type: 'radio' | 'checkbox';
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly inputRef?: RefObject<HTMLInputElement | null> | undefined;
  onPeek(label: string | null): void;
  onChange(): void;
}

/** One option: a native input, styled — its label exact, the recommended one highlighted (D-20, D-23). */
function OptionItem({
  name,
  type,
  label,
  description,
  checked,
  disabled,
  inputRef,
  onPeek,
  onChange,
}: OptionItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const onKey = useCardKeys();
  const recommended = isRecommended(label);

  return (
    <label
      data-recommended={recommended || undefined}
      onMouseEnter={() => {
        onPeek(label);
      }}
      onMouseLeave={() => {
        onPeek(null);
      }}
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm hover:bg-muted',
        recommended ? 'border-primary' : 'border-border',
        checked && 'bg-muted',
      )}
    >
      <input
        ref={inputRef}
        data-question-option
        type={type}
        name={name}
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onFocus={() => {
          onPeek(label);
        }}
        onChange={onChange}
        onKeyDown={onKey}
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium break-words">
          {label}
          {recommended && (
            <span className="ml-2 rounded bg-primary px-1 text-xs text-primary-foreground">
              {t('permission.question.recommended')}
            </span>
          )}
        </span>
        {description !== '' && <span className="text-xs opacity-70">{description}</span>}
      </span>
    </label>
  );
}

/** The field of the free answer, with the focus as soon as it opens. */
function OtherField({
  value,
  disabled,
  onChange,
  onEnter,
}: {
  readonly value: string;
  readonly disabled: boolean;
  onChange(text: string): void;
  onEnter(): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const onKey = useCardKeys();
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  return (
    <input
      ref={field}
      type="text"
      value={value}
      disabled={disabled}
      maxLength={2_000}
      aria-label={t('permission.question.other')}
      placeholder={t('permission.question.otherPlaceholder')}
      className="ml-6 rounded border border-input bg-background px-2 py-1 text-sm"
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          onEnter();
        } else {
          onKey(event);
        }
      }}
    />
  );
}

/**
 * The preview of the option in focus, under the mouse or chosen — markdown, rendered by the safe
 * renderer that parses no HTML, in a monospaced box (D-05).
 */
function PreviewPane({
  question,
  label,
}: {
  readonly question: Question;
  readonly label: string | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const preview = question.options.find((option) => option.label === label)?.preview ?? null;

  return (
    <section
      aria-label={t('permission.question.preview')}
      aria-live="polite"
      className="max-h-80 min-w-0 overflow-auto rounded-md bg-muted p-3 font-mono text-xs"
    >
      {preview === null ? (
        <p className="opacity-70">{t('permission.question.noPreview')}</p>
      ) : (
        <Suspense fallback={<pre className="whitespace-pre-wrap">{preview}</pre>}>
          <Markdown source={preview} />
        </Suspense>
      )}
    </section>
  );
}

/** Not answering: a reason the person may leave empty, and the way back to the questions. */
function DeclineForm({
  disabled,
  canGoBack,
  onConfirm,
  onBack,
}: {
  readonly disabled: boolean;
  readonly canGoBack: boolean;
  onConfirm(reason: string): void;
  onBack(): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  useEffect(() => {
    field.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-semibold">
        {t('permission.question.declineReason')}
      </label>
      <textarea
        ref={field}
        id={id}
        value={reason}
        disabled={disabled}
        onChange={(event) => {
          setReason(event.target.value);
        }}
        className="min-h-16 rounded border border-input bg-background p-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          size="touch"
          disabled={disabled}
          onClick={() => {
            onConfirm(reason);
          }}
        >
          {canGoBack ? t('permission.question.declineConfirm') : t('permission.question.decline')}
        </Button>
        {canGoBack && (
          <Button variant="outline" size="touch" disabled={disabled} onClick={onBack}>
            {t('permission.question.declineBack')}
          </Button>
        )}
      </div>
    </div>
  );
}
