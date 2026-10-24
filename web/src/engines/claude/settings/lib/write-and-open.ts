import { workbenchLocation } from '@/app/workbench-location';
import { createFile } from '@/features/editor';

export interface WriteAndOpenRequest {
  readonly folder: string;
  readonly path: string;
  readonly content: string;
}

/** A navigation call shaped exactly like `useNavigate()`'s own — never the whole router type, so this
 * stays decoupled from it. */
export type NavigateTo = (options: { readonly href: string }) => unknown;

/**
 * Writes a file through the plan 07 endpoint, never over anything (`FILE_EXISTS` is the server's own
 * refusal), then opens it — the one effect every "new <kind>" flow of this screen ends with (plan 13,
 * D-18), whether a name was asked first ({@link useCreateArtifactFlow}) or the path is fixed
 * ({@link useCreateFixedFileFlow}).
 */
export async function writeAndOpen(
  request: WriteAndOpenRequest,
  navigate: NavigateTo,
  onCreated: () => void,
): Promise<void> {
  await createFile({
    folder: request.folder,
    path: request.path,
    content: request.content,
    encoding: 'utf8',
    bom: false,
    confirmSensitive: false,
  });
  onCreated();
  void navigate({ href: workbenchLocation({ folder: request.folder, file: request.path }) });
}
