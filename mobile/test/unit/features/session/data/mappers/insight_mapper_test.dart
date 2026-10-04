/// Reading the catalogue, the models and the context as entities (plan 10, B-11, B-14).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/data/mappers/insight_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';

void main() {
  group('a model', () {
    test('takes the effort levels it lists only when it says it takes an effort', () {
      final SessionModels models = sessionModelsFrom(<String, Object?>{
        'current': 'opus',
        'models': <Object?>[
          <String, Object?>{
            'value': 'opus',
            'displayName': 'Opus',
            'description': 'The largest',
            'supportsEffort': true,
            'supportedEffortLevels': <Object?>['low', 'high', 3],
          },
          <String, Object?>{
            'value': 'haiku',
            'supportsEffort': false,
            'supportedEffortLevels': <Object?>['low'],
          },
          <String, Object?>{'displayName': 'nameless'},
          'not a model',
        ],
      })!;

      expect(models.current, 'opus');
      expect(models.models, const <InstallationModel>[
        InstallationModel(
          value: 'opus',
          displayName: 'Opus',
          description: 'The largest',
          effortLevels: <String>['low', 'high'],
        ),
        InstallationModel(value: 'haiku'),
      ]);
    });

    test('a body with no current model, or no body at all, is not an answer', () {
      expect(sessionModelsFrom(<String, Object?>{'models': <Object?>[]}), isNull);
      expect(sessionModelsFrom('nope'), isNull);
      expect(sessionModelsFrom(<String, Object?>{'current': 'x'})?.models, isEmpty);
    });
  });

  group('the catalogue', () {
    test('has the commands of the menu and the models', () {
      final InstallationCatalog catalog = catalogFrom(<String, Object?>{
        'cliVersion': '2.1',
        'commands': <Object?>[
          <String, Object?>{'name': 'init'},
        ],
        'models': <Object?>[
          <String, Object?>{'value': 'sonnet'},
        ],
      })!;

      expect(catalog.commands.commands.single.name, 'init');
      expect(catalog.models.single.value, 'sonnet');
    });

    test('a catalogue without a menu still has its models; one without models is not one', () {
      expect(catalogFrom(<String, Object?>{'models': <Object?>[]})!.commands.isEmpty, isTrue);
      expect(catalogFrom(<String, Object?>{'commands': <Object?>[]}), isNull);
      expect(catalogFrom(null), isNull);
    });
  });

  group('the context', () {
    test('is the window and its categories, a category with no tokens left out', () {
      final ContextUse use = contextUseFrom(<String, Object?>{
        'model': 'sonnet',
        'totalTokens': 50000,
        'maxTokens': 200000.0,
        'percentage': 25.4,
        'categories': <Object?>[
          <String, Object?>{'id': 'messages', 'name': 'Messages', 'tokens': 40000},
          <String, Object?>{'id': 'broken', 'name': 'Broken'},
          'nope',
        ],
      })!;

      expect(use.totalTokens, 50000);
      expect(use.maxTokens, 200000);
      expect(use.percentage, 25);
      expect(use.categories, const <ContextCategory>[
        ContextCategory(id: 'messages', name: 'Messages', tokens: 40000),
      ]);
    });

    test('S-45 · a measure that is not a number is not a measure', () {
      expect(contextUseFrom(<String, Object?>{'totalTokens': 'a lot'}), isNull);
      expect(contextUseFrom(<Object?>[]), isNull);
    });

    test('a percentage out of range is held to 0…100, and categories are optional', () {
      final ContextUse use = contextUseFrom(<String, Object?>{
        'totalTokens': 1,
        'maxTokens': 1,
        'percentage': 140,
      })!;

      expect(use.percentage, 100);
      expect(use.categories, isEmpty);
    });
  });

  test('the entities say what the composer asks of them', () {
    expect(const InstallationModel(value: 'opus').label, 'opus');
    expect(const InstallationModel(value: 'opus', displayName: 'Opus').label, 'Opus');
    expect(const InstallationModel(value: 'opus').supportsEffort, isFalse);
    expect(const ContextUse(totalTokens: 0, maxTokens: 1, percentage: 80).isNearLimit, isTrue);
    expect(const ContextUse(totalTokens: 0, maxTokens: 1, percentage: 79).isNearLimit, isFalse);
    expect(const InstallationCatalog(), const InstallationCatalog());
  });
}
