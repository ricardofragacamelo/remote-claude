/// Reading the engines of the installation, and what one session's engine can do (plan 28, B-13).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/data/mappers/engine_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';

import '../../../../../support/builders/conversations.dart';

void main() {
  group('capabilities', () {
    test('reads a whole declaration, every field as it came', () {
      expect(engineCapabilitiesFrom(capabilitiesJson()), someCapabilities);
    });

    test(
      'a declaration that says less, or says it in another shape, is not read as "has none"',
      () {
        final List<Object?> unreadable = <Object?>[
          null,
          'everything',
          <String, Object?>{},
          capabilitiesJson()..remove('resume'),
          capabilitiesJson(<String, Object?>{'images': 'yes'}),
          capabilitiesJson(<String, Object?>{'fork': false}),
          capabilitiesJson(<String, Object?>{'cost': null}),
          capabilitiesJson(<String, Object?>{'effortLevels': 'high'}),
          capabilitiesJson(<String, Object?>{
            'effortLevels': <Object?>['high', 3],
          }),
          capabilitiesJson(<String, Object?>{'permissionModes': null}),
        ];

        for (final Object? value in unreadable) {
          expect(engineCapabilitiesFrom(value), isNull, reason: '$value');
        }
      },
    );

    test('plan 28 · S-82 · modes of the previous protocol are read as canonical, each once', () {
      final EngineCapabilities? read = engineCapabilitiesFrom(
        capabilitiesJson(<String, Object?>{
          'permissionModes': <Object?>['default', 'ask', 'plan', 'bypassPermissions', 'allowAll'],
        }),
      );

      expect(read?.permissionModes, <String>['ask', 'readOnly', 'allowAll']);
    });

    test('a capability it does not know yet is ignored, never refused', () {
      expect(
        engineCapabilitiesFrom(capabilitiesJson(<String, Object?>{'teleport': true})),
        someCapabilities,
      );
    });
  });

  group('one engine', () {
    test('reads its id, its name, its state, its version and what it can do', () {
      expect(
        engineFrom(engineJson()),
        const Engine(
          id: anEngine,
          displayName: anEngineName,
          isAvailable: true,
          version: '1.2.3',
          capabilities: someCapabilities,
        ),
      );
    });

    test('an engine that cannot open a session says why, as a key', () {
      final Engine engine = engineFrom(
        engineJson(<String, Object?>{
          'state': 'unavailable',
          'reason': 'engine.reason.notInstalled',
          'version': null,
        }),
      )!;

      expect(engine.isAvailable, isFalse);
      expect(engine.reason, 'engine.reason.notInstalled');
      expect(engine.version, isNull);
    });

    test('a state this build has no word for is not "available"', () {
      expect(engineFrom(engineJson(<String, Object?>{'state': 'warming'}))!.isAvailable, isFalse);
    });

    test('an engine the app cannot read is none', () {
      final List<Object?> unreadable = <Object?>[
        null,
        'engine-a',
        engineJson(<String, Object?>{'id': null}),
        engineJson(<String, Object?>{'displayName': 4}),
        engineJson(<String, Object?>{'state': null}),
        engineJson(<String, Object?>{'capabilities': null}),
      ];

      for (final Object? entry in unreadable) {
        expect(engineFrom(entry), isNull, reason: '$entry');
      }
    });
  });

  group('the catalogue', () {
    test('keeps the engines in the order given, drops the unreadable, and names the default', () {
      final EngineCatalogue catalogue = engineCatalogueFrom(<String, Object?>{
        'defaultEngine': 'engine-b',
        'engines': <Object?>[
          engineJson(),
          'not an engine',
          engineJson(<String, Object?>{'id': 'engine-b', 'displayName': 'Agent B'}),
        ],
      })!;

      expect(catalogue.defaultEngine, 'engine-b');
      expect(catalogue.engines.map((Engine e) => e.id), <String>[anEngine, 'engine-b']);
    });

    test('a body that is not a catalogue is none', () {
      final List<Object?> unreadable = <Object?>[
        null,
        <Object?>[],
        <String, Object?>{'engines': <Object?>[]},
        <String, Object?>{'defaultEngine': anEngine},
        <String, Object?>{'defaultEngine': anEngine, 'engines': 'all'},
      ];

      for (final Object? body in unreadable) {
        expect(engineCatalogueFrom(body), isNull, reason: '$body');
      }
    });
  });
}
