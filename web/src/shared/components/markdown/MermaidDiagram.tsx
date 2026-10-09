import { useEffect, useId, useRef, useState } from 'react';
import { ClipboardCopy, Code, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { Button } from '@/shared/components/ui/button';
import { useCopy } from '@/shared/hooks/useCopy';
import { useTheme } from '@/shared/hooks/useTheme';
import type { Theme } from '@/shared/hooks/useTheme';
import { logger } from '@/shared/logging/logger';
import { MAX_DIAGRAM_SOURCE, accessibleTitleOf } from './diagram';
import type { DiagramResult } from './diagram';
import { drawingOf, keepDrawing, loadDiagramEngine } from './mermaid-loader';

/** A diagram as it stands: drawing, drawn, invalid — or not drawn because the engine did not load. */
type DiagramView = DiagramResult | { readonly kind: 'drawing' } | { readonly kind: 'failed' };

/**
 * The drawing of a source, made once per place, theme and source — and the way to try again. Not
 * `wanted`, nothing is loaded nor drawn.
 */
function useDiagram(
  id: string,
  source: string,
  theme: Theme,
  wanted: boolean,
): [DiagramView, () => void] {
  const key = `${id}\n${theme}\n${source}`;
  const [made, setMade] = useState<{ readonly key: string; readonly view: DiagramView } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wanted || drawingOf(key) !== undefined) return undefined;
    let live = true;

    loadDiagramEngine()
      .then((engine) => engine.render(id, source, theme))
      .then(
        (result) => {
          keepDrawing(key, result);
          if (result.kind === 'invalid') {
            logger.debug({ op: 'markdown.diagram', line: result.line }, 'diagram not drawn');
          }
          if (live) setMade({ key, view: result });
        },
        () => {
          if (live) setMade({ key, view: { kind: 'failed' } });
        },
      );

    return () => {
      live = false;
    };
  }, [key, id, source, theme, attempt, wanted]);

  const view = made?.key === key ? made.view : (drawingOf(key) ?? { kind: 'drawing' });
  return [
    view,
    () => {
      setAttempt((count) => count + 1);
    },
  ];
}

/**
 * The SVG of a diagram, put in the page as nodes — parsed by a document of its own, whose scripts
 * never run, from what the engine already sanitized (ADR-020).
 */
function DrawnSvg({
  svg,
  title,
}: {
  readonly svg: string;
  readonly title: string;
}): React.JSX.Element {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parsed = new DOMParser().parseFromString(svg, 'text/html');
    holder.current?.replaceChildren(...parsed.body.childNodes);
  }, [svg]);

  return (
    <div
      ref={holder}
      role="img"
      aria-label={title}
      className="overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
    />
  );
}

/** What is said in the place of a diagram that is not drawn. */
function Note({ text }: { readonly text: string }): React.JSX.Element {
  return <p className="text-ui-sm text-muted-foreground">{text}</p>;
}

/** The body of a diagram: the drawing, or why there is none, with its source at hand. */
function DiagramBody({
  view,
  source,
  title,
  showCode,
  retry,
}: {
  readonly view: DiagramView;
  readonly source: string;
  readonly title: string;
  readonly showCode: boolean;
  retry(): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const code = (
    <pre aria-label={t('markdown.diagram.source')}>
      <code>{source}</code>
    </pre>
  );

  if (view.kind === 'drawn') {
    return showCode ? code : <DrawnSvg svg={view.svg} title={title} />;
  }
  if (view.kind === 'drawing') {
    return <Note text={t('markdown.diagram.drawing')} />;
  }
  if (view.kind === 'invalid') {
    return (
      <>
        <p className="text-ui-sm text-destructive">
          {view.line === null
            ? t('markdown.diagram.invalid')
            : t('markdown.diagram.invalidLine', { line: view.line })}
        </p>
        {code}
      </>
    );
  }
  return (
    <>
      <div className="flex items-center gap-2">
        <Note text={t('markdown.diagram.loadFailed')} />
        <Button type="button" variant="outline" onClick={retry}>
          {t('common.action.retry')}
        </Button>
      </div>
      {code}
    </>
  );
}

/**
 * A block `mermaid` of a text, as a diagram (21 · B-17): inline SVG, sanitized in three layers
 * (ADR-020), named by its `accTitle` or "Diagram"; "show the code" and back, and "copy" its source;
 * an error said with its line, the source in sight. Its ids are its own, so two of the same source
 * share no style (S-65). Too long a source is not drawn at all (S-57).
 */
export function MermaidDiagram({ source }: { readonly source: string }): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme((state) => state.theme);
  const id = `mermaid-${useId().replace(/[^\w-]/g, '')}`;
  const tooLarge = source.length > MAX_DIAGRAM_SOURCE;
  const [view, retry] = useDiagram(id, source, theme, !tooLarge);
  const [showCode, setShowCode] = useState(false);
  const copy = useCopy(source);
  const title = accessibleTitleOf(source) ?? t('markdown.diagram.label');

  return (
    <figure className="flex flex-col gap-1">
      <div className="flex items-center justify-end gap-1">
        {view.kind === 'drawn' && !tooLarge && (
          <IconButton
            icon={showCode ? Workflow : Code}
            label={showCode ? t('markdown.diagram.showDiagram') : t('markdown.diagram.showCode')}
            onClick={() => {
              setShowCode(!showCode);
            }}
          />
        )}
        <IconButton
          icon={ClipboardCopy}
          label={t('markdown.diagram.copy')}
          onClick={() => {
            copy.copy();
          }}
        />
      </div>
      {tooLarge ? (
        <>
          <Note
            text={t('markdown.diagram.tooLarge', {
              size: source.length,
              limit: MAX_DIAGRAM_SOURCE,
            })}
          />
          <pre aria-label={t('markdown.diagram.source')}>
            <code>{source}</code>
          </pre>
        </>
      ) : (
        <DiagramBody view={view} source={source} title={title} showCode={showCode} retry={retry} />
      )}
      <span role="status" className="sr-only">
        {copy.state === 'copied' ? t('markdown.diagram.copied') : ''}
        {copy.state === 'failed' ? t('markdown.diagram.copyFailed') : ''}
      </span>
    </figure>
  );
}
