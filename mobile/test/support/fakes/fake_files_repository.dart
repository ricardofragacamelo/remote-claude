/// A files repository a test drives (plan 25).
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/entities/file_limits.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';
import 'package:remote_claude/features/files/domain/repositories/files_repository.dart';

/// The ceilings of a test installation.
const FileLimits testLimits = FileLimits(
  maxTextBytes: 10 * 1024 * 1024,
  largeFileBytes: 1024 * 1024,
  downloadMaxBytes: 200 * 1024 * 1024,
);

/// Answers the levels the test set, and records what it was asked.
class FakeFilesRepository implements FilesRepository {
  /// The entries of each level, by its path relative to the folder.
  final Map<String, List<FileEntry>> levels = <String, List<FileEntry>>{};

  /// The levels the server cut at its ceiling.
  final Set<String> truncated = <String>{};

  /// What a level throws instead of answering.
  final Map<String, Object> failures = <String, Object>{};

  /// Every level asked, in order, as `folder|path`.
  final List<String> asked = <String>[];

  /// Held open while a test looks at the loading state, or answers out of order.
  Completer<void>? gate;

  @override
  Future<FileListing> tree(String folder, String path) async {
    asked.add('$folder|$path');
    await gate?.future;

    final Object? thrown = failures[path];
    if (thrown != null) {
      throw thrown;
    }

    return FileListing(
      folder: folder,
      path: path,
      entries: levels[path] ?? const <FileEntry>[],
      truncated: truncated.contains(path),
    );
  }

  /// What reading the ceilings throws, when the test wants it to.
  Object? limitsFailure;

  @override
  Future<FileLimits> limits() async {
    final Object? thrown = limitsFailure;
    if (thrown != null) {
      throw thrown;
    }
    return testLimits;
  }

  /// The text of each file, by its path.
  final Map<String, TextDocument> texts = <String, TextDocument>{};

  /// The bytes of each file, by its path.
  final Map<String, RawFile> raws = <String, RawFile>{};

  /// Every read of a text, as `path|If-None-Match`.
  final List<String> reads = <String>[];

  /// Answers held, one per read of a text, in the order they were asked: a test completes them in
  /// any order to answer out of order (S-77).
  final List<Completer<void>> held = <Completer<void>>[];

  /// Holds every read of a text until the test lets it go.
  bool holdReads = false;

  @override
  Future<TextRead> content(String folder, String path, {String? ifNoneMatch}) async {
    reads.add('$path|${ifNoneMatch ?? ''}');
    final TextDocument? document = texts[path];
    if (holdReads) {
      final Completer<void> hold = Completer<void>();
      held.add(hold);
      await hold.future;
    }
    await gate?.future;

    final Object? thrown = failures[path];
    if (thrown != null) {
      throw thrown;
    }
    final TextDocument now = document ?? TextDocument(path: path, content: '', etag: '"0"');
    return ifNoneMatch == now.etag ? const TextUnchanged() : TextChanged(now);
  }

  @override
  Future<RawFile> raw(String folder, String path) async {
    reads.add('raw:$path');
    await gate?.future;

    final Object? thrown = failures[path];
    if (thrown != null) {
      throw thrown;
    }
    return raws[path] ?? const RawFile(bytes: <int>[], contentType: 'application/octet-stream');
  }

  /// Every file read by ranges, in order.
  final List<String> readers = <String>[];

  @override
  ByteReader reader(String folder, String path) {
    readers.add(path);
    final RawFile raw = raws[path] ?? const RawFile(bytes: <int>[], contentType: 'application/pdf');
    return MemoryByteReader(Uint8List.fromList(raw.bytes), contentType: raw.contentType);
  }

  /// Every file downloaded, in order, and where each was written.
  final List<({String path, String into})> downloads = <({String path, String into})>[];

  /// Held open while a test looks at a download on its way; a cancel lets it go at once.
  Completer<void>? downloadGate;

  /// What a download throws once it is let go.
  Object? downloadFailure;

  /// The type the server gives the bytes.
  String? downloadType = 'text/plain';

  /// What arrives before [downloadGate] opens: bytes so far, and the size of the whole.
  List<(int, int?)> downloadSteps = <(int, int?)>[(1, 2)];

  @override
  Future<FetchedFile> download(
    String folder,
    String path, {
    required String into,
    required DownloadProgress onProgress,
    required DownloadCancel cancel,
  }) async {
    downloads.add((path: path, into: into));
    for (final (int received, int? total) in downloadSteps) {
      onProgress(received, total);
    }
    final Completer<void> stopped = Completer<void>();
    cancel.onCancel(stopped.complete);
    await Future.any(<Future<void>>[downloadGate?.future ?? Future<void>.value(), stopped.future]);

    if (cancel.cancelled) {
      return (complete: false, contentType: null);
    }
    final Object? thrown = downloadFailure;
    if (thrown != null) {
      throw thrown;
    }
    final int? whole = downloadSteps.last.$2;
    onProgress(whole ?? 2, whole);
    return (complete: true, contentType: downloadType);
  }
}

/// A file read by ranges from memory.
class MemoryByteReader implements ByteReader {
  MemoryByteReader(this.bytes, {this.contentType = 'application/pdf'});

  final Uint8List bytes;
  final String? contentType;

  @override
  Future<ByteProbe> probe() async => ByteProbe(size: bytes.length, contentType: contentType);

  @override
  Future<Uint8List> read(int start, int length) async => Uint8List.sublistView(
    bytes,
    start,
    start + length > bytes.length ? bytes.length : start + length,
  );
}
