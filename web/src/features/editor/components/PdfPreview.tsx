import { FileWarning, LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { usePdf } from '../hooks/usePdf';
import { baseName } from '../lib/paths';
import { PaneError } from './PaneError';
import { PaneLoading } from './PaneLoading';
import { PdfPassword } from './pdf/PdfPassword';
import { PdfReader } from './pdf/PdfReader';

export interface PdfPreviewProps {
  readonly folder: string;
  readonly path: string;

  /** The editor tab it is in, with its group — whose place in the PDF is remembered (21 · D-06). */
  readonly tab: string;
}

/** A PDF that could not be shown, and why — with the way to try again when there is one. */
function Refused({
  icon: Icon,
  message,
  retry,
}: {
  readonly icon: typeof FileWarning;
  readonly message: string;
  readonly retry?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div role="alert" className="flex flex-col items-center gap-2 p-6 text-center text-ui-sm">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <p>{message}</p>
      {retry !== undefined && (
        <Button type="button" variant="outline" onClick={retry}>
          {t('common.action.retry')}
        </Button>
      )}
    </div>
  );
}

/**
 * The preview of a PDF (B-50, S-311; plan 21): the reader of the pdf.js of our own build — never the
 * browser's own viewer, which would open the file in an origin of its own (07 · D-18). It asks for
 * the password of a PDF that has one, and says why a PDF that cannot be shown is not.
 */
export function PdfPreview({ folder, path, tab }: PdfPreviewProps): React.JSX.Element {
  const { t } = useTranslation();
  const pdf = usePdf(folder, path);
  const name = baseName(path);

  if (pdf.error !== null) {
    return <PaneError error={pdf.error} onRetry={pdf.retry} />;
  }

  if (pdf.corrupt) {
    return <Refused icon={FileWarning} message={t('editor.preview.pdfBroken', { name })} />;
  }

  if (pdf.locked) {
    return (
      <Refused icon={LockKeyhole} message={t('editor.pdf.protected', { name })} retry={pdf.retry} />
    );
  }

  if (pdf.password !== null) {
    return (
      <PdfPassword
        // A question asked again is a new field: a wrong password does not stay in it (S-22).
        key={`${pdf.password}-${String(pdf.trying)}`}
        name={name}
        reason={pdf.password}
        trying={pdf.trying}
        submit={pdf.submitPassword}
        cancel={pdf.cancelPassword}
      />
    );
  }

  return pdf.doc === null ? (
    <PaneLoading />
  ) : (
    <PdfReader folder={folder} tab={tab} doc={pdf.doc} name={name} />
  );
}
