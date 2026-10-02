import { isValidElement } from 'react';
import type { ComponentProps, ComponentType, MouseEvent, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components, Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
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
   * language of its fence (`''` when it names none). Without one, it is a plain `<pre>`.
   */
  renderCode?(code: string, language: string): ReactNode;

  /** How code inline in the text is drawn. Without one, a `<code>`. */
  renderInlineCode?(code: string): ReactNode;

  /** Plugins of the text beyond GitHub's — one that turns the names of files into links, say. */
  readonly remarkPlugins?: NonNullable<Options['remarkPlugins']>;
}

/** The plugins: GitHub's tables, task lists, strikethrough and autolinks — and nothing that parses HTML. */
const REMARK_PLUGINS = [remarkGfm];

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
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2',
  '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:text-left',
  '[&_a]:underline [&_a]:underline-offset-4 [&_hr]:border-border',
);

type AnchorProps = ComponentProps<'a'>;
type ImageProps = ComponentProps<'img'>;

/** A link of the text, as what its URL is lets it be. */
function linkOf(
  href: string,
  children: ReactNode,
  onRelativeLink: MarkdownProps['onRelativeLink'],
): React.JSX.Element {
  const kind = kindOfUrl(href);

  if (kind === 'web') {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  }

  if (kind === 'mail') {
    return <a href={href}>{children}</a>;
  }

  if (kind === 'relative' && onRelativeLink !== undefined) {
    return (
      <a
        href={href}
        onClick={(event: MouseEvent) => {
          event.preventDefault();
          onRelativeLink(href);
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
 * The code of a fenced block and the language its fence named (`''` for none), from what the
 * renderer hands its `<pre>`: one `<code>`, whose text is the code and whose class is
 * `language-<name>`. Anything else in a `<pre>` is no code — raw HTML never gets this far.
 */
export function fencedCodeOf(children: ReactNode): {
  readonly code: string;
  readonly language: string;
} {
  const props = isValidElement<ComponentProps<'code'>>(children) ? children.props : {};
  const { className } = props;

  return {
    code: typeof props.children === 'string' ? props.children.replace(/\n$/, '') : '',
    language: typeof className === 'string' ? className.replace(/^language-/, '') : '',
  };
}

/**
 * The elements a host draws code with, when it says how: a fenced block is the `<pre>` around a
 * `<code>`, and inline code is a `<code>` alone.
 */
function codeComponents(
  renderCode: MarkdownProps['renderCode'],
  renderInlineCode: MarkdownProps['renderInlineCode'],
): Components {
  return {
    ...(renderCode === undefined
      ? {}
      : {
          pre: ({ children }: ComponentProps<'pre'>) => {
            const { code, language } = fencedCodeOf(children);
            return renderCode(code, language);
          },
        }),
    ...(renderInlineCode === undefined
      ? {}
      : {
          // Code inline in the text holds one text, never elements: there is no HTML in it.
          code: ({ children }: ComponentProps<'code'>) => renderInlineCode(String(children)),
        }),
  };
}

/** An image of the text: a remote one never loads — it becomes a link (08 · D-04). */
function ImageOf({
  src,
  alt,
  relativeImage: RelativeImage,
}: {
  readonly src: string;
  readonly alt: string;
  readonly relativeImage: MarkdownProps['relativeImage'];
}): React.JSX.Element {
  const { t } = useTranslation();
  const kind = kindOfUrl(src);

  if (kind === 'web') {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        {t('markdown.image.remote', { name: alt === '' ? src : alt })}
      </a>
    );
  }

  if (kind === 'relative' && RelativeImage !== undefined) {
    return <RelativeImage src={src} alt={alt} />;
  }

  return <span>{alt}</span>;
}

/**
 * Markdown, rendered safely — the one renderer of the product (plan 07 · B-50, plan 08 · D-04): the
 * previews of the editor and, later, Claude's answers.
 *
 * - **raw HTML never becomes DOM**: no `rehype-raw`, and `skipHtml` drops what the text writes as a
 *   tag — a `<script>`, an `<img onerror>`, an `<iframe>` are not there at all;
 * - a URL is kept only when it is `http`, `https`, `mailto` or relative (`safeUrl`); anything else is
 *   its text;
 * - a remote image is never fetched — it is a link to it, so a text cannot make the page call a host;
 * - a relative link and a relative image are the host's to resolve.
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
  const components: Components = {
    a: ({ href, children }: AnchorProps) => linkOf(asText(href), children, onRelativeLink),
    img: ({ src, alt }: ImageProps) => (
      <ImageOf src={asText(src)} alt={asText(alt)} relativeImage={relativeImage} />
    ),
    ...codeComponents(renderCode, renderInlineCode),
  };

  return (
    <div className={cn(PROSE, className)}>
      <ReactMarkdown
        remarkPlugins={
          remarkPlugins === undefined ? REMARK_PLUGINS : [...REMARK_PLUGINS, ...remarkPlugins]
        }
        skipHtml
        urlTransform={safeUrl}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
