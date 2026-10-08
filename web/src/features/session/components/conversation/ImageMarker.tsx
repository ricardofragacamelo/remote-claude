import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { formatBytes } from '@/features/editor';
import { DialogFrame } from '@/shared/components/DialogFrame';
import { Button } from '@/shared/components/ui/button';
import { usePromptImage } from '../../hooks/usePromptImage';
import type { MessageBlock } from '../../types/live-session';

/** The refusals of the route that trying again does not change: the type, the size, the absence. */
const FINAL = new Set(['UNSUPPORTED_MEDIA_TYPE', 'PAYLOAD_TOO_LARGE', 'NOT_FOUND']);

/** `image/png` as a person reads it — `PNG`; `null` when the prompt did not say. */
function formatOf(mediaType: string | undefined): string | null {
  const subtype = mediaType?.split('/')[1];
  return subtype === undefined || subtype === '' ? null : subtype.toUpperCase();
}

/** The image of an open marker: it, while it loads, or why it cannot be shown. */
function OpenImage({
  conversationId,
  blockId,
}: {
  readonly conversationId: string;
  readonly blockId: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const image = usePromptImage(conversationId, blockId);

  if (image.error !== null) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-ui-sm text-destructive">
        <p>{t(image.error.messageKey, image.error.params)}</p>
        {!FINAL.has(image.error.code) && (
          <Button variant="outline" onClick={image.retry}>
            {t('common.action.retry')}
          </Button>
        )}
      </div>
    );
  }

  return image.url === null ? (
    <p role="status" className="text-ui-sm text-muted-foreground">
      {t('sessions.image.loading')}
    </p>
  ) : (
    <img
      src={image.url}
      alt={t('sessions.image.alt')}
      className="max-h-[70vh] max-w-full self-center object-contain"
    />
  );
}

/**
 * The image a prompt carried, as a **marker** — "Attached image", its type and its size — in the
 * place of an empty bubble, a prompt of only an image too (plan 22, B-30, S-118, S-121). The bytes
 * never travel with the conversation (D-09): opening it fetches them, with the credential in the
 * header, and shows them in a dialog by a `blob:` revoked when it closes (S-119). A refusal of the
 * route — the type, the size, the absence — is said in words in the place of the image (S-120).
 *
 * An image that cannot be asked for — no conversation in the store yet, a server too old to name the
 * block — is the marker alone.
 */
export function ImageMarker({
  block,
  conversationId,
}: {
  readonly block: MessageBlock;
  readonly conversationId: string | null;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const details = [
    formatOf(block.mediaType),
    block.size === undefined ? null : formatBytes(block.size, i18n.language),
  ].filter((each): each is string => each !== null);
  const label =
    details.length === 0
      ? t('sessions.image.attached')
      : t('sessions.image.attachedWith', { details: details.join(', ') });
  const blockId = block.blockId;

  return (
    <div className="flex items-center gap-2 self-start rounded-md border border-border px-2 py-1 text-ui-sm">
      <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>{label}</span>
      {conversationId !== null && blockId !== undefined && (
        <>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(true);
            }}
          >
            {t('sessions.image.open')}
          </Button>
          <DialogFrame
            open={open}
            onClose={() => {
              setOpen(false);
            }}
            title={label}
            description={t('sessions.image.description')}
            footer={
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                }}
              >
                {t('sessions.image.close')}
              </Button>
            }
          >
            {open && <OpenImage conversationId={conversationId} blockId={blockId} />}
          </DialogFrame>
        </>
      )}
    </div>
  );
}
