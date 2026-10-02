import { lazy, Suspense } from 'react';
import { Code } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ensureLoaded } from '../hooks/documents';
import { usePreviewText } from '../hooks/usePreviewText';
import { baseName } from '../lib/paths';
import { previewKindOf } from '../lib/preview-kinds';
import { PaneError } from './PaneError';
import { PaneLoading } from './PaneLoading';
import { PdfPreview } from './PdfPreview';
import { RawImage } from './RawImage';

/**
 * The markdown renderer is a chunk of its own, loaded by the first markdown previewed — the parser
 * and its plugins are not part of the first page (B-50).
 */
const MarkdownPreview = lazy(() =>
  import('./MarkdownPreview').then((module) => ({ default: module.MarkdownPreview })),
);

export interface PreviewPaneProps {
  readonly folder: string;
  readonly path: string;
}

/** A preview drawn from the file's text — markdown rendered, HTML as its source. */
function TextPreview({ folder, path }: PreviewPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const { doc, text } = usePreviewText(folder, path);
  const failure = doc?.failure ?? null;

  if (failure !== null) {
    return (
      <PaneError
        error={failure}
        onRetry={() => {
          void ensureLoaded(folder, path, true);
        }}
      />
    );
  }

  if (text === null) {
    return <PaneLoading />;
  }

  if (previewKindOf(path) === 'markdown') {
    return (
      <Suspense fallback={<PaneLoading />}>
        <MarkdownPreview folder={folder} path={path} text={text} />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col">
      <p
        role="note"
        className="flex items-center gap-2 border-b border-border px-3 py-1 text-ui-sm"
      >
        <Code className="size-4 shrink-0" aria-hidden />
        {t('editor.preview.htmlSource')}
      </p>
      <pre
        aria-label={t('editor.preview.sourceLabel', { name: baseName(path) })}
        className="p-3 font-code text-ui-sm whitespace-pre-wrap"
      >
        {text}
      </pre>
    </div>
  );
}

/**
 * The preview of a file (B-50), by what it is: markdown rendered safely, an image or an SVG as a
 * blob in an `<img>`, a PDF drawn by our pdf.js, an HTML file as its source — never as a page
 * (07 · D-18). The scrolling region is named, so a screen reader knows which preview it is in.
 */
export function PreviewPane({ folder, path }: PreviewPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const kind = previewKindOf(path);
  const name = baseName(path);

  return (
    <section
      aria-label={t('editor.preview.label', { name })}
      className="flex size-full min-h-0 min-w-0 flex-col overflow-auto"
    >
      {kind === 'pdf' && <PdfPreview folder={folder} path={path} />}
      {(kind === 'image' || kind === 'svg') && (
        <div className="flex flex-1 items-center justify-center p-4">
          <RawImage folder={folder} path={path} alt={name} />
        </div>
      )}
      {(kind === 'markdown' || kind === 'html') && <TextPreview folder={folder} path={path} />}
      {kind === null && (
        <p className="p-6 text-ui-sm text-muted-foreground">{t('editor.preview.none', { name })}</p>
      )}
    </section>
  );
}
