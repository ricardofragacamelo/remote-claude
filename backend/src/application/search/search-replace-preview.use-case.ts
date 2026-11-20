import { ReadFileUseCase } from '@application/files';
import type { UserId } from '@domain/auth';
import {
  FileNotEncodableError,
  FileNotFoundError,
  FileNotTextError,
  FileTooLargeError,
} from '@domain/files';
import { preserveCase, resolvedReplacementOf } from '@domain/search';
import type { SearchMatchResult } from './search-text.use-case';
import type { SearchTextInput, SearchTextResult } from './search-text.use-case';
import type { SearchTextUseCase } from './search-text.use-case';

export interface SearchReplacePreviewInput extends SearchTextInput {
  readonly replacement: string;
  readonly preserveCase: boolean;
}

export interface SearchReplacePreviewMatchResult extends SearchMatchResult {
  /** What [SearchReplacePreviewInput.replacement] resolves to for this one match (B-11). */
  readonly replacement: string;
}

export interface SearchReplacePreviewFileResult {
  readonly path: string;
  readonly matches: readonly SearchReplacePreviewMatchResult[];
  /** The sha256 of the content this preview read — the same one the apply flow checks (S-81). */
  readonly etag: string;
}

export interface SearchReplacePreviewResult {
  readonly files: AsyncIterable<SearchReplacePreviewFileResult>;
  readonly outcome: SearchTextResult['outcome'];
}

/**
 * The replace preview (B-11): the same search as B-10's, with two things added per file — the
 * resolved replacement text of every match, and the file's own `ETag`, read fresh rather than
 * reused from the engine, because `rg --json` never carries the whole file (only matched lines).
 *
 * A file that changed shape between the search and this read (gone, turned binary, grew past the
 * edit ceiling) is left out of the preview rather than failing it — there is nothing useful to
 * preview for it, and the apply flow reports the same file on its own terms if it is ever named.
 */
export class SearchReplacePreviewUseCase {
  constructor(
    private readonly searchText: SearchTextUseCase,
    private readonly readFile: ReadFileUseCase,
  ) {}

  async execute(
    input: SearchReplacePreviewInput,
    signal?: AbortSignal,
  ): Promise<SearchReplacePreviewResult> {
    const run = await this.searchText.execute(input, signal);
    const readFile = this.readFile;
    const { folder, userId, replacement, preserveCase: preserve } = input;

    const files = (async function* (): AsyncIterable<SearchReplacePreviewFileResult> {
      for await (const file of run.files) {
        const etag = await etagOfOrNull(readFile, folder, file.path, userId);
        if (etag === null) {
          continue;
        }
        yield {
          path: file.path,
          etag,
          matches: file.matches.map((match) => toPreviewMatch(match, replacement, preserve)),
        };
      }
    })();

    return { files, outcome: run.outcome };
  }
}

function toPreviewMatch(
  match: SearchMatchResult,
  replacement: string,
  preserve: boolean,
): SearchReplacePreviewMatchResult {
  const matchedText = match.preview.slice(match.previewMatchStart, match.previewMatchEnd);
  const resolved = resolvedReplacementOf(replacement, matchedText);

  return { ...match, replacement: preserve ? preserveCase(matchedText, resolved) : resolved };
}

async function etagOfOrNull(
  readFile: ReadFileUseCase,
  folder: string,
  path: string,
  userId: UserId,
): Promise<string | null> {
  try {
    const opened = await readFile.execute(
      { folder, path, encoding: null, ifNoneMatch: null },
      userId,
    );
    return opened.kind === 'opened' ? opened.etag.value : null;
  } catch (error) {
    if (
      error instanceof FileNotFoundError ||
      error instanceof FileNotTextError ||
      error instanceof FileNotEncodableError ||
      error instanceof FileTooLargeError
    ) {
      return null;
    }
    throw error;
  }
}
