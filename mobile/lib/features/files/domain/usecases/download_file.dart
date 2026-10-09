/// A file of the folder, downloaded and handed to the system's "save as" (plan 25, B-27).
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/domain/entities/file_limits.dart';
import 'package:remote_claude/features/files/domain/ports/file_saver.dart';
import 'package:remote_claude/features/files/domain/ports/temporary_files.dart';
import 'package:remote_claude/features/files/domain/repositories/files_repository.dart';

/// The type a file the server gave no type to is saved as.
const String anyType = 'application/octet-stream';

/// Downloads a file in stream to a temporary of its own, offers it to the "save as", and deletes
/// the temporary in every outcome — saved, cancelled, refused (S-123, S-124, S-125).
class DownloadFile {
  const DownloadFile(this._files, this._temporary, this._saver);

  final FilesRepository _files;
  final TemporaryFiles _temporary;
  final FileSaver _saver;

  /// Downloads [request], telling [onProgress] how far it went, until [cancel] stops it.
  Future<DownloadOutcome> call(
    DownloadRequest request, {
    required DownloadProgress onProgress,
    required DownloadCancel cancel,
  }) async {
    try {
      // The ceiling first: a file past it is not asked for at all (S-127).
      final FileLimits limits = await _files.limits();
      final int? size = request.size;
      if (size != null && size > limits.downloadMaxBytes) {
        return DownloadTooLarge(limits.downloadMaxBytes);
      }
    } on Failure catch (failure) {
      return DownloadRefused(failure);
    }

    final String temporary = await _temporary.create(request.name);
    try {
      return await _fetchAndSave(request, temporary, onProgress, cancel);
    } on Failure catch (failure) {
      return DownloadRefused(failure);
    } finally {
      await _temporary.discard(temporary);
    }
  }

  Future<DownloadOutcome> _fetchAndSave(
    DownloadRequest request,
    String temporary,
    DownloadProgress onProgress,
    DownloadCancel cancel,
  ) async {
    final FetchedFile fetched = await _files.download(
      request.folder,
      request.path,
      into: temporary,
      onProgress: onProgress,
      cancel: cancel,
    );
    if (!fetched.complete) {
      return const DownloadCancelled();
    }

    final SaveOutcome saved = await _saver.save(
      temporaryPath: temporary,
      name: request.name,
      mimeType: (fetched.contentType ?? anyType).split(';').first.trim(),
    );
    return switch (saved) {
      Saved() => const Downloaded(),
      SaveCancelled() => const DownloadCancelled(),
      SaveFailed(:final String reason) => DownloadNotSaved(reason),
    };
  }
}
