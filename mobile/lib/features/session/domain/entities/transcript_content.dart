/// What a conversation holds that its timeline does not carry: the whole output of a tool, and the
/// image a prompt carried. Each is asked for when the person opens it (plan 22, B-11, B-12).
library;

import 'dart:typed_data';

import 'package:equatable/equatable.dart';

/// The whole output of a tool, as the transcript keeps it — or, above the server's ceiling, its
/// start and its end, said to be cut (D-08).
class ToolOutput extends Equatable {
  const ToolOutput({required this.text, this.truncated = false, this.bytes = 0, this.cutAt});

  final String text;

  /// The output was larger than what came: [text] is its start and its end.
  final bool truncated;

  /// How large the whole output is, in bytes of UTF-8 — what "it had" says.
  final int bytes;

  /// Where, in [text], the start ends and the end begins — `null` when nothing was cut.
  final int? cutAt;

  @override
  List<Object?> get props => <Object?>[text, truncated, bytes, cutAt];
}

/// The bytes of an image a prompt carried, and what they are.
class PromptImageBytes extends Equatable {
  const PromptImageBytes({required this.bytes, this.mediaType});

  final Uint8List bytes;

  /// The type the server said they are, when it said.
  final String? mediaType;

  @override
  List<Object?> get props => <Object?>[bytes, mediaType];
}
