import type { UserId } from '@domain/auth';
import type { EntryKind, Etag, FilePath } from '@domain/files';
import type { TransferLimits } from './file-limits';
import type { FolderDisk } from './ports/folder-disk.port';
import type { FolderResolver } from './ports/folder-resolver.port';
import { ensureDirectory, planUpload } from './upload-plan';
import type { DeclaredFile } from './upload-plan';

/** What `POST /files/upload/preflight` asks: the files an upload is about to send, and where. */
export interface PreflightCommand {
  readonly folder: string;
  readonly directory: string;
  readonly items: readonly DeclaredFile[];
}

/** One item, and what is already where it would go. */
export interface PreflightItem {
  readonly path: FilePath;
  /** `null` when the name is free; the `ETag` only of a file this server can hash. */
  readonly existing: { readonly kind: EntryKind; readonly etag: Etag | null } | null;
}

/**
 * The conflicts of an upload **before** it is sent — plan 07, B-49, for the screen of B-52.
 *
 * "Replace, keep both or skip" is asked file by file before anything moves — the preview before the
 * wide effect — and the `ETag` of each file that is there is what a "replace" then sends back as its
 * `If-Match`. The paths and the ceilings are checked by the same rule as the upload, so a name the
 * preflight accepts is a name the upload accepts. Nothing is written, and nothing goes to the trail.
 */
export class PreflightUploadUseCase {
  constructor(
    private readonly folders: FolderResolver,
    private readonly disk: FolderDisk,
    private readonly limits: TransferLimits,
  ) {}

  async execute(command: PreflightCommand, userId: UserId): Promise<readonly PreflightItem[]> {
    const folder = await this.folders.resolve(command.folder, userId);
    const plan = planUpload(folder, command.directory, command.items, this.limits, 'items');

    await ensureDirectory(this.disk, plan.directory);

    const items: PreflightItem[] = [];

    for (const target of plan.targets) {
      items.push({ path: target, existing: await this.existingAt(target) });
    }

    return items;
  }

  private async existingAt(target: FilePath): Promise<PreflightItem['existing']> {
    const found = await this.disk.inspect(target);

    if (found === null) {
      return null;
    }

    return { kind: found.kind, etag: await this.disk.version(target) };
  }
}
