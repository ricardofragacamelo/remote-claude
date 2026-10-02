import { createContext, useContext } from 'react';

import { Markdown } from '@/shared/components/markdown/Markdown';
import type { RelativeImageProps } from '@/shared/components/markdown/Markdown';
import { logger } from '@/shared/logging/logger';
import { openFile } from '../hooks/tabs';
import { resolveLink } from '../lib/links';
import { RawImage } from './RawImage';

/** The file a preview renders — what its relative links and images are relative to. */
const PreviewedFile = createContext<{ readonly folder: string; readonly path: string }>({
  folder: '',
  path: '',
});

/** An image a markdown text names by a relative path: a file of the folder, through `raw` (S-308). */
function RelativeImage({ src, alt }: RelativeImageProps): React.JSX.Element {
  const { folder, path } = useContext(PreviewedFile);

  return <RawImage folder={folder} path={resolveLink(path, src)} alt={alt} />;
}

export interface MarkdownPreviewProps {
  readonly folder: string;
  readonly path: string;

  /** The text — the buffer of the file, unsaved changes included (S-312). */
  readonly text: string;
}

/**
 * The preview of a markdown file (B-50), by the shared safe renderer: raw HTML never becomes DOM, a
 * relative link to a file of the folder opens it in the editor, a relative image loads through `raw`
 * as a blob (S-308).
 */
export function MarkdownPreview({ folder, path, text }: MarkdownPreviewProps): React.JSX.Element {
  return (
    <PreviewedFile.Provider value={{ folder, path }}>
      <Markdown
        source={text}
        className="mx-auto max-w-3xl p-6"
        relativeImage={RelativeImage}
        onRelativeLink={(href) => {
          const target = resolveLink(path, href);

          if (target === null) {
            logger.debug({ op: 'editor.preview.link', folder }, 'link out of the folder');
            return;
          }

          openFile(folder, target);
        }}
      />
    </PreviewedFile.Provider>
  );
}
