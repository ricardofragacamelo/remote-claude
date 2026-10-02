import { useMemo } from 'react';

import { openFile } from '@/features/editor';
import { Markdown } from '@/shared/components/markdown/Markdown';
import { fileLinkOf } from '../../lib/file-links';
import { remarkFileLinks } from '../../lib/remark-file-links';
import { CodeBlock } from './CodeBlock';

export interface ChatMarkdownProps {
  /** The markdown of the answer — content nobody reviewed: the model read files and pages. */
  readonly source: string;

  /** The real path of the folder of the tab — what a name of a file is resolved against. */
  readonly folder: string;
}

/**
 * Claude's answer, rendered — through the one safe renderer of the product (plan 08, B-14): raw HTML
 * never becomes an element, a URL is only `http`, `https`, `mailto` or relative, and a remote image
 * is a link, never loaded (R-01). Loaded on demand, never in the first chunk of the page.
 *
 * On top of it, what the panel adds: a block of code with its buttons (B-15), and the names of files
 * of the folder as links that open the file in the editor, at the line (B-16).
 */
export default function ChatMarkdown({ source, folder }: ChatMarkdownProps): React.JSX.Element {
  const plugins = useMemo(() => (folder === '' ? [] : [remarkFileLinks(folder)]), [folder]);

  const open = (text: string): void => {
    const link = fileLinkOf(text.replace(/^\.\//, ''), folder);
    if (link !== null) {
      openFile(folder, link.path, link.line === null ? {} : { line: link.line });
    }
  };

  return (
    <Markdown
      source={source}
      remarkPlugins={plugins}
      {...(folder === '' ? {} : { onRelativeLink: open })}
      renderCode={(code, language) => <CodeBlock code={code} language={language} folder={folder} />}
      renderInlineCode={(code) =>
        folder !== '' && fileLinkOf(code, folder) !== null ? (
          <button
            type="button"
            className="rounded-sm bg-muted px-1 font-code text-ui-sm underline underline-offset-4"
            onClick={() => {
              open(code);
            }}
          >
            {code}
          </button>
        ) : (
          <code>{code}</code>
        )
      }
    />
  );
}
