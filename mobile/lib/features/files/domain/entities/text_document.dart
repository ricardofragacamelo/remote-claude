/// A text file of the folder, as the server decoded it (plan 25, B-14).
library;

import 'package:equatable/equatable.dart';

/// The text of one file and its version.
class TextDocument extends Equatable {
  const TextDocument({
    required this.path,
    required this.content,
    required this.etag,
    this.encoding = 'utf8',
    this.eol = 'lf',
    this.size = 0,
    this.largeFile = false,
  });

  /// Relative to the open folder.
  final String path;

  /// The text, decoded by the server.
  final String content;

  /// The version — what `If-None-Match` names on the next read.
  final String etag;

  /// The encoding it was decoded from.
  final String encoding;

  /// `lf`, `crlf` or `mixed`.
  final String eol;

  /// In bytes, on disk.
  final int size;

  /// Past the server's light-mode line (1 MB): it opens, with a strip that says so.
  final bool largeFile;

  @override
  List<Object?> get props => <Object?>[path, content, etag, encoding, eol, size, largeFile];
}

/// What reading a text again answers: the new text, or that it did not change.
sealed class TextRead {
  const TextRead();
}

/// The text on disk is another version.
final class TextChanged extends TextRead {
  const TextChanged(this.document);

  final TextDocument document;
}

/// The version named is still the one on disk — `304`, nothing to rebuild (S-74).
final class TextUnchanged extends TextRead {
  const TextUnchanged();
}

/// A file's bytes as they are, and the type the server read in them.
class RawFile {
  const RawFile({required this.bytes, required this.contentType});

  final List<int> bytes;
  final String? contentType;
}
