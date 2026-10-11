/// An engine repository a test drives (plan 28, B-13).
library;

import 'package:remote_claude/features/session/domain/entities/engine.dart';
import 'package:remote_claude/features/session/domain/repositories/engine_repository.dart';

import '../builders/conversations.dart';

/// Answers the catalogue it holds, or fails while [failure] is set, and counts what it was asked.
class FakeEngineRepository implements EngineRepository {
  FakeEngineRepository({this.failure});

  EngineCatalogue catalogue = const EngineCatalogue(
    defaultEngine: anEngine,
    engines: <Engine>[
      Engine(
        id: anEngine,
        displayName: anEngineName,
        isAvailable: true,
        capabilities: someCapabilities,
      ),
    ],
  );
  Object? failure;
  int asked = 0;

  @override
  Future<EngineCatalogue> list() async {
    asked += 1;
    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }
    return catalogue;
  }
}
