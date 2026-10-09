import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { useHelpPanel } from '@/shared/hooks/useHelpPanel';
import type { HelpSection, HelpTarget } from '@/shared/hooks/useHelpPanel';

/** A shortcut of the screen, as the help lists it. */
export interface ScreenShortcut {
  /** How a person writes it — `Ctrl+O`. */
  readonly keys: string;

  /** What it does — translated. */
  readonly description: string;
}

/**
 * A part of a screen's help besides the four fixed ones — what only that screen has, written with
 * values only known at run time (the ceilings of the server, plan 07 · B-53).
 */
export interface HelpExtra {
  /** The anchor: `help-<id>`. */
  readonly id: string;

  /** Translated. */
  readonly heading: string;
  readonly body: ReactNode;
}

export interface HelpPanelProps {
  /** The screen's title, already translated. */
  readonly title: string;

  /** The prefix of the screen's help keys: `<help>.what`, `<help>.states`, `<help>.notRecorded`. */
  readonly help: string;
  readonly shortcuts: readonly ScreenShortcut[];

  /** Where the heading's id comes from, so the panel is labelled by it. */
  readonly headingId: string;

  /** What its close button does — closing the help of the screen, unless the host says otherwise. */
  onClose?(): void;

  /** Parts of its own, after the three written ones and before the shortcuts. */
  readonly extra?: readonly HelpExtra[];
}

/** The anchor of one part — what a "learn more" of a control scrolls to. */
export function helpAnchor(section: HelpTarget): string {
  return `help-${section}`;
}

/**
 * The key of one written part of a screen's help.
 *
 * A function and not a template inside `t()`: the i18n check reads a `t(`…${`, with nothing before
 * the placeholder, as "every key is used" — and the check of unused keys would then check nothing.
 * The keys a screen's help needs are proved by the check of the screen frames' `help` instead
 * (plan 06, S-94).
 */
function keyOf(help: string, part: Exclude<HelpSection, 'shortcuts'>): string {
  return [help, part].join('.');
}

/**
 * The help of a screen, in its four fixed parts: what it is, what each state means, what it does
 * **not** show or record, and its shortcuts.
 *
 * Written for somebody who has never seen the product. Each part has an anchor, so a "learn more"
 * beside a control opens the right one.
 */
export function HelpPanel({
  title,
  help,
  shortcuts,
  headingId,
  onClose,
  extra = [],
}: HelpPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const section = useHelpPanel((state) => state.section);
  const setOpen = useHelpPanel((state) => state.setOpen);
  const shown = useHelpPanel((state) => state.shown);

  useEffect(() => {
    if (section === null) {
      return;
    }

    const target = document.getElementById(helpAnchor(section));
    target?.scrollIntoView?.({ block: 'start' });
    target?.focus();
    shown();
  }, [section, shown]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <h2 id={headingId} className="text-ui font-ui-strong">
          {t('help.panel.title', { screen: title })}
        </h2>
        <IconButton
          icon={X}
          label={t('help.panel.close')}
          onClick={() => {
            (onClose ?? (() => setOpen(false)))();
          }}
        />
      </div>

      <Part section="what" heading={t('help.section.what')}>
        <p>{t(keyOf(help, 'what'))}</p>
      </Part>
      <Part section="states" heading={t('help.section.states')}>
        <p>{t(keyOf(help, 'states'))}</p>
      </Part>
      <Part section="notRecorded" heading={t('help.section.notRecorded')}>
        <p>{t(keyOf(help, 'notRecorded'))}</p>
      </Part>
      {extra.map((part) => (
        <PartFrame key={part.id} id={`help-${part.id}`} heading={part.heading}>
          {part.body}
        </PartFrame>
      ))}
      <Part section="shortcuts" heading={t('help.section.shortcuts')}>
        {shortcuts.length === 0 ? (
          <p>{t('help.shortcuts.none')}</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.keys} className="contents">
                <dt>
                  <kbd className="rounded-sm border border-border px-1 font-code text-ui-sm">
                    {shortcut.keys}
                  </kbd>
                </dt>
                <dd>{shortcut.description}</dd>
              </div>
            ))}
          </dl>
        )}
      </Part>
    </div>
  );
}

interface PartProps {
  readonly section: HelpSection;
  readonly heading: string;
  readonly children: React.ReactNode;
}

/** One part of the help, with its anchor. */
function Part({ section, heading, children }: PartProps): React.JSX.Element {
  return (
    <PartFrame id={helpAnchor(section)} heading={heading}>
      {children}
    </PartFrame>
  );
}

/** The frame of a part: a section labelled by its heading, reachable by its anchor. */
function PartFrame({
  id,
  heading,
  children,
}: {
  readonly id: string;
  readonly heading: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-4 flex-col gap-1 text-ui text-muted-foreground"
    >
      <h3
        id={`${id}-heading`}
        className="text-ui-sm font-ui-strong tracking-wide text-foreground uppercase"
      >
        {heading}
      </h3>
      {children}
    </section>
  );
}
