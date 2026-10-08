/// What a conversation's timeline only marks, opened when the person asks: the whole output of a
/// tool and the image of a prompt (plan 22, B-32, B-33).
library;

import 'dart:async';

import 'package:flutter_riverpod/misc.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'transcript_content_controllers.g.dart';

/// How long a tool's whole output stays in memory once no card shows it — a card scrolled out of
/// the list and back asks nothing again. The output of a finished tool never changes.
const Duration toolOutputKeptFor = Duration(minutes: 5);

/// Never asked again on its own: a failure stays on screen with "try again", and the person decides
/// (S-115, S-120). Riverpod retries a failed provider by default.
Duration? _neverRetry(int retryCount, Object error) => null;

/// The whole output of one tool of the main conversation, read **once** when its card is first
/// opened: the card keeps watching it while it is on screen, so folding and unfolding asks nothing
/// (S-113), and it outlives the card for [toolOutputKeptFor].
@Riverpod(retry: _neverRetry)
class ToolResultController extends _$ToolResultController {
  @override
  Future<ToolOutput> build(String conversationId, String toolUseId) {
    _keepForAWhile();
    return ref.watch(readTranscriptContentProvider).toolResult(conversationId, toolUseId);
  }

  /// Asks again, after it did not arrive.
  void retry() => ref.invalidateSelf();

  void _keepForAWhile() {
    final KeepAliveLink link = ref.keepAlive();
    Timer? release;

    ref.onCancel(() => release = Timer(toolOutputKeptFor, link.close));
    ref.onResume(() => release?.cancel());
    ref.onDispose(() => release?.cancel());
  }
}

/// The image of one prompt, read when the person opens it — with the credential in the header,
/// never in a URL (D-10, S-122) — and let go when the screen that shows it closes, so the bytes do
/// not outlive it (S-119).
@Riverpod(retry: _neverRetry)
class PromptImageController extends _$PromptImageController {
  @override
  Future<PromptImageBytes> build(String conversationId, String blockId) =>
      ref.watch(readTranscriptContentProvider).promptImage(conversationId, blockId);

  /// Asks again, after it did not arrive for a reason asking again can change.
  void retry() => ref.invalidateSelf();
}
