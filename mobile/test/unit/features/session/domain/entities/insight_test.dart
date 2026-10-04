/// What the composer shows about an installation and a session, compared by value.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';

// ignore_for_file: prefer_const_constructors
void main() {
  test('every value compares by what it carries', () {
    expect(InstallationModel(value: 'a'), InstallationModel(value: 'a'));
    expect(InstallationModel(value: 'a'), isNot(InstallationModel(value: 'a', description: 'd')));
    expect(SessionModels(current: 'a'), SessionModels(current: 'a'));
    expect(SessionModels(current: 'a'), isNot(SessionModels(current: 'b')));
    expect(InstallationCatalog(), InstallationCatalog());
    expect(
      InstallationCatalog(),
      isNot(InstallationCatalog(models: <InstallationModel>[InstallationModel(value: 'a')])),
    );
    expect(
      ContextCategory(id: 'a', name: 'A', tokens: 1),
      ContextCategory(id: 'a', name: 'A', tokens: 1),
    );
    expect(
      ContextUse(totalTokens: 1, maxTokens: 2, percentage: 50),
      ContextUse(totalTokens: 1, maxTokens: 2, percentage: 50),
    );
    expect(
      ContextUse(totalTokens: 1, maxTokens: 2, percentage: 50),
      isNot(ContextUse(totalTokens: 1, maxTokens: 2, percentage: 51)),
    );
  });

  test(
    'a model is called by the installation’s name for it, and takes an effort only with levels',
    () {
      expect(InstallationModel(value: 'opus').label, 'opus');
      expect(InstallationModel(value: 'opus', displayName: 'Opus').label, 'Opus');
      expect(InstallationModel(value: 'opus').supportsEffort, isFalse);
      expect(
        InstallationModel(value: 'opus', effortLevels: <String>['low']).supportsEffort,
        isTrue,
      );
    },
  );
}
