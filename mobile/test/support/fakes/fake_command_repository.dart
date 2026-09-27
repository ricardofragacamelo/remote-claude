/// A command repository a test drives.
library;

import 'dart:async';

import 'package:remote_claude/features/session/domain/entities/slash_command.dart';
import 'package:remote_claude/features/session/domain/repositories/command_repository.dart';

/// Answers the menu the test set, and records every session it was asked about.
class FakeCommandRepository implements CommandRepository {
  /// What [menu] answers.
  CommandMenu answer = const CommandMenu();

  /// What [menu] throws instead of answering, when the test wants the error state.
  Object? failure;

  /// Held open while a test wants to look at the loading state.
  Completer<void>? gate;

  /// Every session asked about, in order.
  final List<String> reads = <String>[];

  @override
  Future<CommandMenu> menu(String sessionId) async {
    reads.add(sessionId);
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return answer;
  }
}
