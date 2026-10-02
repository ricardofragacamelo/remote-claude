import type { FileLimits, HistoryLimits, TransferLimits } from './file-limits';

/**
 * Every ceiling a client has to know before it starts, by the names of the contract: the editor's,
 * the transfer's whole, and the history's snapshot ceiling under a name of its own.
 */
export type ClientLimits = Readonly<
  Pick<FileLimits, 'maxEditBytes' | 'largeFileBytes'> &
    TransferLimits & { readonly historyMaxFileBytes: number }
>;

/**
 * The ceilings of the `files` module, for `GET /files/limits` — plan 07, B-47.
 *
 * Said **before** the client starts, so "this is too large to download" is a sentence on the
 * screen before the transfer and not a `413` after it ([07 · D-16](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos)).
 * They are the installation's configuration, read once; a client caches them for its session.
 */
export class ReadLimitsUseCase {
  private readonly limits: ClientLimits;

  constructor(
    files: Pick<FileLimits, 'maxEditBytes' | 'largeFileBytes'>,
    transfer: TransferLimits,
    history: Pick<HistoryLimits, 'maxFileBytes'>,
  ) {
    this.limits = {
      maxEditBytes: files.maxEditBytes,
      largeFileBytes: files.largeFileBytes,
      downloadMaxBytes: transfer.downloadMaxBytes,
      archiveMaxEntries: transfer.archiveMaxEntries,
      uploadMaxBytes: transfer.uploadMaxBytes,
      uploadMaxEntries: transfer.uploadMaxEntries,
      uploadMaxTotalBytes: transfer.uploadMaxTotalBytes,
      historyMaxFileBytes: history.maxFileBytes,
    };
  }

  execute(): ClientLimits {
    return this.limits;
  }
}
