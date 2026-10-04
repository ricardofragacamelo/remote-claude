/// An insight repository a test drives: the catalogue, the models and the context it answers.
library;

import 'dart:async';

import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/repositories/insight_repository.dart';

/// Answers what the test set, or throws what it set; records every question.
class FakeInsightRepository implements InsightRepository {
  InstallationCatalog catalog = const InstallationCatalog(
    models: <InstallationModel>[
      InstallationModel(value: 'sonnet', displayName: 'Sonnet'),
      InstallationModel(
        value: 'opus',
        displayName: 'Opus',
        effortLevels: <String>['low', 'medium', 'high'],
      ),
    ],
  );
  SessionModels models = const SessionModels(
    current: 'sonnet',
    models: <InstallationModel>[
      InstallationModel(value: 'sonnet', displayName: 'Sonnet'),
      InstallationModel(value: 'opus', displayName: 'Opus', effortLevels: <String>['high']),
    ],
  );
  ContextUse context = const ContextUse(
    totalTokens: 50000,
    maxTokens: 200000,
    percentage: 25,
    categories: <ContextCategory>[
      ContextCategory(id: 'messages', name: 'Messages', tokens: 40000),
      ContextCategory(id: 'somethingNew', name: 'Something new', tokens: 10000),
    ],
  );

  /// Thrown instead of answering, per question.
  Object? catalogFailure;
  Object? modelsFailure;
  Object? contextFailure;

  /// Held open while a test looks at the loading state.
  Completer<void>? gate;

  final List<String> asked = <String>[];

  @override
  Future<InstallationCatalog> catalogOf(String workspacePath) =>
      _answer('catalog:$workspacePath', catalogFailure, () => catalog);

  @override
  Future<SessionModels> modelsOf(String sessionId) =>
      _answer('models:$sessionId', modelsFailure, () => models);

  @override
  Future<ContextUse> contextOf(String sessionId) =>
      _answer('context:$sessionId', contextFailure, () => context);

  Future<T> _answer<T>(String question, Object? failure, T Function() answer) async {
    asked.add(question);
    await gate?.future;

    if (failure != null) {
      throw failure;
    }

    return answer();
  }
}
