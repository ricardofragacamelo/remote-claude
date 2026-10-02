import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useRawObjectUrl } from '../hooks/useRawObjectUrl';
import { PaneError } from './PaneError';

export interface RawImageProps {
  readonly folder: string;

  /** Relative to the folder — `null` for an image a text names out of the folder. */
  readonly path: string | null;

  /** What the image shows, said to a screen reader — the file's name, or a markdown text's words. */
  readonly alt: string;
  readonly className?: string;
}

/**
 * An image of the folder, drawn from a blob the page fetched with the credential in the header —
 * `<img src="blob:…">`, never a URL of the API with a token in it (S-309). An SVG drawn so runs
 * none of its scripts (S-310); bytes the browser cannot draw become a translated placeholder, never a
 * broken-image icon (S-313).
 */
export function RawImage({ folder, path, alt, className }: RawImageProps): React.JSX.Element {
  const { t } = useTranslation();
  const { url, error, retry } = useRawObjectUrl(folder, path);
  const [broken, setBroken] = useState<string | null>(null);

  if (path === null || (url !== null && broken === url)) {
    return (
      <span className="inline-flex flex-col items-center gap-1 p-4 text-ui-sm text-muted-foreground">
        <ImageOff className="size-6" aria-hidden />
        <span>{t('editor.preview.broken', { name: alt })}</span>
      </span>
    );
  }

  if (error !== null) {
    return <PaneError error={error} onRetry={retry} />;
  }

  if (url === null) {
    return <Skeleton className="h-32 w-48" />;
  }

  return (
    <img
      src={url}
      alt={alt}
      className={cn('max-w-full', className)}
      onError={() => {
        setBroken(url);
      }}
    />
  );
}
