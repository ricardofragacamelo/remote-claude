/// The engines of the installation, as the app has them (plan 28, B-13).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';

import '../../../../../support/builders/conversations.dart';

void main() {
  const Engine a = Engine(
    id: anEngine,
    displayName: anEngineName,
    isAvailable: true,
    capabilities: someCapabilities,
  );
  const Engine b = Engine(
    id: 'engine-b',
    displayName: 'Agent B',
    isAvailable: false,
    reason: 'engine.reason.notInstalled',
    capabilities: someCapabilities,
  );
  const EngineCatalogue catalogue = EngineCatalogue(
    defaultEngine: anEngine,
    engines: <Engine>[a, b],
  );

  test('finds an engine by its id, and nothing for an id it does not have', () {
    expect(catalogue.engineOf('engine-b'), b);
    expect(catalogue.engineOf('engine-z'), isNull);
  });

  test('S-40 · names an engine by its display name, and an unknown one by its id', () {
    expect(catalogue.displayNameOf(anEngine), anEngineName);
    expect(catalogue.displayNameOf('engine-z'), 'engine-z');
  });

  test('lists every display name by its id', () {
    expect(catalogue.displayNames, <String, String>{anEngine: anEngineName, 'engine-b': 'Agent B'});
    expect(const EngineCatalogue(defaultEngine: anEngine).displayNames, isEmpty);
  });

  test('plan 28 · B-27 · what an engine can do, the default engine’s when none is named', () {
    expect(catalogue.capabilitiesOf('engine-b'), someCapabilities);
    expect(catalogue.capabilitiesOf(null), someCapabilities);
    expect(catalogue.capabilitiesOf('engine-z'), isNull);
    expect(const EngineCatalogue(defaultEngine: anEngine).capabilitiesOf(null), isNull);
  });

  group('plan 28 · S-82 · the canonical mode of a name', () {
    test('a canonical name is itself', () {
      for (final String mode in <String>['ask', 'acceptEdits', 'readOnly', 'allowAll']) {
        expect(canonicalPermissionMode(mode), mode);
      }
    });

    test('a name of the previous protocol is the one it became', () {
      expect(canonicalPermissionMode('default'), 'ask');
      expect(canonicalPermissionMode('plan'), 'readOnly');
    });

    test('anything else is dropped', () {
      expect(canonicalPermissionMode('bypassPermissions'), isNull);
      expect(canonicalPermissionMode(''), isNull);
      expect(canonicalPermissionMode(null), isNull);
    });
  });

  test('two catalogues, engines or declarations that say the same are equal', () {
    expect(catalogue, const EngineCatalogue(defaultEngine: anEngine, engines: <Engine>[a, b]));
    expect(
      catalogue,
      isNot(const EngineCatalogue(defaultEngine: 'engine-b', engines: <Engine>[a, b])),
    );
    expect(a, isNot(b));
    expect(someCapabilities, isNot(_withoutImages(someCapabilities)));
  });
}

EngineCapabilities _withoutImages(EngineCapabilities c) => EngineCapabilities(
  resume: c.resume,
  fork: c.fork,
  history: c.history,
  images: false,
  promptWhileBusy: c.promptWhileBusy,
  questions: c.questions,
  planApproval: c.planApproval,
  taskList: c.taskList,
  subagents: c.subagents,
  thinking: c.thinking,
  slashCommands: c.slashCommands,
  modelSwitch: c.modelSwitch,
  effortLevels: c.effortLevels,
  contextUse: c.contextUse,
  mcp: c.mcp,
  compaction: c.compaction,
  cost: c.cost,
  permissionModes: c.permissionModes,
);
