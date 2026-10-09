/// The ceilings of the server's file routes, read before trying (plan 25, B-09).
library;

import 'package:equatable/equatable.dart';

/// What `GET /files/limits` says, in bytes.
class FileLimits extends Equatable {
  const FileLimits({
    required this.maxTextBytes,
    required this.largeFileBytes,
    required this.downloadMaxBytes,
  });

  /// Past this, `/files/content` answers `413` — the ceiling of the text viewer too (D-09).
  final int maxTextBytes;

  /// Past this, a text opens with a strip that says its size.
  final int largeFileBytes;

  /// Past this, nothing is downloaded.
  final int downloadMaxBytes;

  @override
  List<Object?> get props => <Object?>[maxTextBytes, largeFileBytes, downloadMaxBytes];
}
