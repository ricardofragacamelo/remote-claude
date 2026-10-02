/**
 * The ceilings the `files` module is held to — configured, because the numbers of
 * [07 · D-04](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-04--teto-de-tamanho-e-encoding)
 * and [D-10](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-10--exclusões-padrão-e-teto-da-árvore)
 * are provisional until they are measured.
 */
export interface FileLimits {
  /** Entries of one level of the tree (default 5 000). */
  readonly treeEntries: number;
  /** Above this, a file opens in the light mode of the editor (default 1 MB). */
  readonly largeFileBytes: number;
  /** Above this, a file is not opened for editing at all, and a save is refused (default 10 MB). */
  readonly maxEditBytes: number;
  /** What one copy may carry. */
  readonly copyEntries: number;
  readonly copyBytes: number;
  /** How far the count of a folder about to be deleted goes before it stops and says "at least". */
  readonly deleteCountCap: number;
}

/**
 * What one download, one zip and one upload may carry — configured, because the numbers of
 * [07 · D-16](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos)
 * are provisional until the blob a phone's browser holds is measured. The web reads them before it
 * starts (`GET /files/limits`), so a refusal is said before the first byte, not after the last.
 */
export interface TransferLimits {
  /** The most bytes one download takes out: a file, or the measure of a zip (default 200 MB). */
  readonly downloadMaxBytes: number;
  /** The most entries one zip carries (default 10 000). */
  readonly archiveMaxEntries: number;
  /** The largest file one upload writes (default 100 MB). */
  readonly uploadMaxBytes: number;
  /** The most files one upload writes (default 1 000). */
  readonly uploadMaxEntries: number;
  /** The most bytes one upload writes, all files together (default 500 MB). */
  readonly uploadMaxTotalBytes: number;
}

/**
 * How much of the local history is kept — configured, with the defaults of
 * [07 · D-17](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local).
 */
export interface HistoryLimits {
  /** Above this, a version is not kept, and its entry says so (default 10 MB). */
  readonly maxFileBytes: number;
  /** The most versions kept of one file; the oldest goes first (default 50). */
  readonly maxPerFile: number;
  /** The most bytes of distinct contents the whole store holds (default 512 MB). */
  readonly maxStoreBytes: number;
  /** How long a version is kept (default 30 days). */
  readonly retentionDays: number;
  /** The most entries one delete keeps; past it, the delete takes the definitive step (default 1 000). */
  readonly maxBatchEntries: number;
}
