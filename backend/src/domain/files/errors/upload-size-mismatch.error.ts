import { DomainError } from '@domain/shared';

/**
 * A part of an upload that did not carry the bytes its manifest declared — `400`, for that item.
 *
 * Longer is cut at one byte past the declaration and refused; shorter is what a connection that
 * dropped, or a body that ended early, looks like. Either way **nothing** of the item stays on the
 * disk: the bytes went to a temporary, never to the name ([07 · B-49](../../../../../docs/plans/07-explorer-and-editor/F7-previews-and-transfer.md#b-49--upload-)).
 * `received` is what arrived — at least that much, for a part that was cut.
 */
export class UploadSizeMismatchError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'files.error.uploadSizeMismatch';

  constructor(path: string, declared: number, received: number) {
    super(`${path} declared ${String(declared)} bytes and carried ${String(received)}`, {
      path,
      declared,
      received,
    });
  }
}
