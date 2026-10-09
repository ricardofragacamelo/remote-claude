import { createContext, isValidElement, useContext, useMemo } from 'react';
import type { ComponentProps, ComponentType, MouseEvent, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components, Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { isDiagramFence } from './diagram';
import { MermaidDiagram } from './MermaidDiagram';
import { remarkClosedFences } from './remark-closed-fences';
import { asText, kindOfUrl, safeUrl } from './safe-url';

/** What a host is handed to draw an image of a relative path — loaded its own way. */
export interface RelativeImageProps {
  /** The path as the text wrote it, relative to the document. */
  readonly src: string;
  readonly alt: string;
}

export interface MarkdownProps {
  /** The markdown text. */
  readonly source: string;

  /**
   * A relative link was followed — the host opens it (the editor opens the file of the folder).
   * Without one, a relative link is shown as its text: a link to a path the page cannot resolve
   * would navigate the app itself.
   */
  onRelativeLink?(href: string): void;

  /** How an image of a relative path is drawn. Without one, it is its text. */
  readonly relativeImage?: ComponentType<RelativeImageProps>;
  readonly className?: string;

  /**
   * How a fenced block of code is drawn — highlighted, with its own buttons — given its text and the
   * language of its fence (`''` when it names none). Without one, it is a plain `<pre>`. A closed
   * block named `mermaid` is a diagram, and never reaches it.
   */
  renderCode?(code: string, language: string): ReactNode;

  /** How code inline in the text is drawn. Without one, a `<code>`. */
  renderInlineCode?(code: string): ReactNode;

  /** Plugins of the text beyond GitHub's — one that turns the names of files into links, say. */
  readonly remarkPlugins?: NonNullable<Options['remarkPlugins']>;
}

/**
 * The plugins: GitHub's tables, task lists, strikethrough and autolinks; the mark of a closed fence —
 * and nothing that parses HTML.
 */
const REMARK_PLUGINS = [remarkGfm, remarkClosedFences];

/** The look of the elements markdown makes, by token — no typography plugin, no literal colour. */
const PROSE = cn(
  'flex flex-col gap-3 text-ui leading-relaxed break-words',
  '[&_h1]:text-xl [&_h1]:font-ui-strong [&_h2]:text-lg [&_h2]:font-ui-strong',
  '[&_h3]:font-ui-strong [&_h4]:font-ui-strong',
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3',
  '[&_blockquote]:text-muted-foreground',
  '[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:font-code [&_code]:text-ui-sm',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3',
  // A long line scrolls in its block: it never widens the text around it (plan 21, S-50).
  '[&_pre]:[contain:inline-size]',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_a]:underline [&_a]:underline-offset-4 [&_hr]:border-border',
);

/**
 * A table in the mold of GitHub's (21 · D-12): it scrolls in its own box, never the page; cells
 * padded both ways and aligned to the top, a header on `muted`, rows alternating, and a long token
 * broken inside its cell.
 */
const TABLE = cn(
  'w-max max-w-none border-collapse text-ui-sm',
  '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5',
  '[&_th]:text-left [&_th]:align-top [&_th]:font-ui-strong',
  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top',
  '[&_th]:max-w-[40ch] [&_td]:max-w-[40ch] [&_td]:[overflow-wrap:anywhere]',
  '[&_th]:[overflow-wrap:anywhere] [&_tbody_tr:nth-child(even)]:bg-muted/40',
);

/** What the host said, read by the elements below — kept out of them so they never change. */
interface Host {
  readonly onRelativeLink?: MarkdownProps['onRelativeLink'] | undefined;
  readonly relativeImage?: MarkdownProps['relativeImage'] | undefined;
  readonly renderCode?: MarkdownProps['renderCode'] | undefined;
  readonly renderInlineCode?: MarkdownProps['renderInlineCode'] | undefined;
}

const HostContext = createContext<Host>({});

/** A link that leaves the app: a new tab, with the rel of every link of a text. */
function OutsideLink({
  url,
  children,
}: {
  readonly url: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

/** A link of the text, as what its URL is lets it be. */
function Anchor({ href, children }: ComponentProps<'a'>): React.JSX.Element {
  const { onRelativeLink } = useContext(HostContext);
  const url = asText(href);
  const kind = kindOfUrl(url);

  if (kind === 'web') {
    return <OutsideLink url={url}>{children}</OutsideLink>;
  }

  if (kind === 'mail') {
    return <a href={url}>{children}</a>;
  }

  if (kind === 'relative' && onRelativeLink !== undefined) {
    return (
      <a
        href={url}
        onClick={(event: MouseEvent) => {
          event.preventDefault();
          onRelativeLink(url);
        }}
      >
        {children}
      </a>
    );
  }

  // A place in the same text, a refused URL, a path nobody resolves: its words, and no navigation.
  return <span>{children}</span>;
}

/**
 * The code of a fenced block, the language its fence named (`''` for none), and whether its closing
 * fence is in the text — from what the renderer hands its `<pre>`: one `<code>`, whose text is the
 * code and whose class is `language-<name>`. Anything else in a `<pre>` is no code — raw HTML never
 * gets this far.
 */
export function fencedCodeOf(children: ReactNode): {
  readonly code: string;
  readonly language: string;
  readonly closed: boolean;
} {
  const props: Record<string, unknown> = isValidElement<Record<string, unknown>>(children)
    ? children.props
    : {};
  const { className } = props;

  return {
    code: typeof props['children'] === 'string' ? props['children'].replace(/\n$/, '') : '',
    language: typeof className === 'string' ? className.replace(/^language-/, '') : '',
    closed: props['data-closed'] === 'true',
  };
}

/**
 * A fenced block: a closed `mermaid` one is a diagram (21 · B-17, D-14); any other is the host's to
 * draw, or a plain `<pre>`.
 */
function Pre({ children }: ComponentProps<'pre'>): ReactNode {
  const { renderCode } = useContext(HostContext);
  const { code, language, closed } = fencedCodeOf(children);

  if (closed && isDiagramFence(language)) {
    return <MermaidDiagram source={code} />;
  }

  return renderCode === undefined ? <pre>{children}</pre> : renderCode(code, language);
}

/**
 * Code inline in the text — and the `<code>` inside a fenced block, which its `<pre>` reads. Drawn by
 * the host when it says how.
 */
function InlineCode({ children, className }: ComponentProps<'code'>): ReactNode {
  const { renderInlineCode } = useContext(HostContext);

  // Code inline in the text holds one text, never elements: there is no HTML in it.
  return renderInlineCode === undefined ? (
    <code className={className}>{children}</code>
  ) : (
    renderInlineCode(String(children))
  );
}

/** A table of the text, in a box of its own that scrolls sideways (21 · B-15). */
function Table({ children }: ComponentProps<'table'>): React.JSX.Element {
  return (
    <div
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a wide table scrolls sideways inside its box, and a region that scrolls must be reachable by keyboard (WCAG 2.1.1, axe scrollable-region-focusable; plan 21, S-50)
      tabIndex={0}
      // Its width is the text's, never the table's: a wide table scrolls here and widens nothing.
      className="max-w-full overflow-x-auto [contain:inline-size] focus-visible:outline-2 focus-visible:outline-ring"
    >
      <table className={TABLE}>{children}</table>
    </div>
  );
}

/** An image of the text: a remote one never loads — it becomes a link (08 · D-04). */
function Image({ src, alt }: ComponentProps<'img'>): React.JSX.Element {
  const { t } = useTranslation();
  const { relativeImage: RelativeImage } = useContext(HostContext);
  const url = asText(src);
  const text = asText(alt);
  const kind = kindOfUrl(url);

  if (kind === 'web') {
    return (
      <OutsideLink url={url}>
        {t('markdown.image.remote', { name: text === '' ? url : text })}
      </OutsideLink>
    );
  }

  if (kind === 'relative' && RelativeImage !== undefined) {
    return <RelativeImage src={url} alt={text} />;
  }

  return <span>{text}</span>;
}

/**
 * The elements of the text, the same ones on every render: a new set each time would make React put
 * every element back from scratch on each delta of a streamed answer — and draw its diagrams again
 * (S-63). What the host said reaches them through a context.
 */
const COMPONENTS: Components = {
  a: Anchor,
  img: Image,
  pre: Pre,
  code: InlineCode,
  table: Table,
};

/**
 * Markdown, rendered safely — the one renderer of the product (plan 07 · B-50, plan 08 · D-04): the
 * previews of the editor, Claude's answers, the plans to approve.
 *
 * - **raw HTML never becomes DOM**: no `rehype-raw`, and `skipHtml` drops what the text writes as a
 *   tag — a `<script>`, an `<img onerror>`, an `<iframe>` are not there at all;
 * - a URL is kept only when it is `http`, `https`, `mailto` or relative (`safeUrl`); anything else is
 *   its text;
 * - a remote image is never fetched — it is a link to it, so a text cannot make the page call a host;
 * - a relative link and a relative image are the host's to resolve;
 * - a wide table scrolls in its own box, and a closed `mermaid` block is a diagram, sanitized
 *   (plan 21, ADR-020).
 */
export function Markdown({
  source,
  onRelativeLink,
  relativeImage,
  className,
  renderCode,
  renderInlineCode,
  remarkPlugins,
}: MarkdownProps): React.JSX.Element {
  const host = useMemo<Host>(
    () => ({ onRelativeLink, relativeImage, renderCode, renderInlineCode }),
    [onRelativeLink, relativeImage, renderCode, renderInlineCode],
  );

  return (
    <HostContext.Provider value={host}>
      <div className={cn(PROSE, className)}>
        <ReactMarkdown
          remarkPlugins={
            remarkPlugins === undefined ? REMARK_PLUGINS : [...REMARK_PLUGINS, ...remarkPlugins]
          }
          skipHtml
          urlTransform={safeUrl}
          components={COMPONENTS}
        >
          {source}
        </ReactMarkdown>
      </div>
    </HostContext.Provider>
  );
}
