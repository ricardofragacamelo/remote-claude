/// A file of the folder read piece by piece — what the PDF engine asks for (plan 25, B-23, D-22).
library;

import 'dart:typed_data';

/// The size of a file and the type the server read in its first bytes.
class ByteProbe {
  const ByteProbe({required this.size, required this.contentType});

  final int size;
  final String? contentType;
}

/// Reads one file by ranges, never holding the whole of it (R-02).
abstract interface class ByteReader {
  /// Reads the first piece, which says the size and the type.
  ///
  /// @throws [Failure] — the server refused, or nothing answered
  Future<ByteProbe> probe();

  /// [length] bytes from [start] — fewer only at the end of the file.
  ///
  /// @throws [Failure] — the server refused, or nothing answered
  Future<Uint8List> read(int start, int length);
}
