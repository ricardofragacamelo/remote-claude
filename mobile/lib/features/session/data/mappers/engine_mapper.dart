/// Reads `GET /engines` and the capabilities of `session.started` as entities.
///
/// The only file that knows both the wire of an engine and the entity. It reads by the generated
/// types of the contract — after checking the shape first: the generated readers assert their
/// fields, which is right for a frame this app built and wrong for an answer from the network.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart' as wire;
import 'package:remote_claude/features/session/domain/entities/engine.dart';

/// The capabilities that are a yes or a no.
const List<String> _flags = <String>[
  'resume',
  'history',
  'images',
  'promptWhileBusy',
  'questions',
  'planApproval',
  'taskList',
  'subagents',
  'thinking',
  'slashCommands',
  'modelSwitch',
  'contextUse',
  'mcp',
  'compaction',
];

/// The capabilities [value] declares, or `null` when it is not a whole declaration.
///
/// A declaration missing a field is not read as "has nothing": a capability is never supposed, in
/// either direction.
EngineCapabilities? engineCapabilitiesFrom(Object? value) {
  if (value is! Map<String, Object?> ||
      !_flags.every((String key) => value[key] is bool) ||
      value['fork'] is! String ||
      value['cost'] is! String ||
      !_texts(value['effortLevels']) ||
      !_texts(value['permissionModes'])) {
    return null;
  }

  final wire.EngineCapabilities declared = wire.EngineCapabilities.fromJson(value);

  return EngineCapabilities(
    resume: declared.resume,
    fork: declared.fork,
    history: declared.history,
    images: declared.images,
    promptWhileBusy: declared.promptWhileBusy,
    questions: declared.questions,
    planApproval: declared.planApproval,
    taskList: declared.taskList,
    subagents: declared.subagents,
    thinking: declared.thinking,
    slashCommands: declared.slashCommands,
    modelSwitch: declared.modelSwitch,
    effortLevels: declared.effortLevels,
    contextUse: declared.contextUse,
    mcp: declared.mcp,
    compaction: declared.compaction,
    cost: declared.cost,
    // Canonical names only, each once: a mode of the previous protocol is read as the one it became,
    // and one this build does not know is not offered (plan 28, B-27).
    permissionModes: <String>{
      for (final String mode in declared.permissionModes) ?canonicalPermissionMode(mode),
    }.toList(growable: false),
  );
}

/// One engine, or `null` when [entry] is not one this build can read.
Engine? engineFrom(Object? entry) {
  if (entry is! Map<String, Object?>) {
    return null;
  }

  final Object? id = entry['id'];
  final Object? displayName = entry['displayName'];
  final Object? state = entry['state'];
  final EngineCapabilities? capabilities = engineCapabilitiesFrom(entry['capabilities']);

  if (id is! String || displayName is! String || state is! String || capabilities == null) {
    return null;
  }

  final Object? reason = entry['reason'];
  final Object? version = entry['version'];

  return Engine(
    id: id,
    displayName: displayName,
    // A state added after this build shipped is not "available": opening a session on it is the
    // server's to refuse, and this build has no word for it.
    isAvailable: state == 'available',
    reason: reason is String ? reason : null,
    version: version is String ? version : null,
    capabilities: capabilities,
  );
}

/// The catalogue [body] answers, the unreadable engines dropped — or `null` when it is not a
/// catalogue at all.
EngineCatalogue? engineCatalogueFrom(Object? body) {
  if (body is! Map<String, Object?>) {
    return null;
  }

  final Object? defaultEngine = body['defaultEngine'];
  final Object? engines = body['engines'];

  if (defaultEngine is! String || engines is! List<Object?>) {
    return null;
  }

  return EngineCatalogue(
    defaultEngine: defaultEngine,
    engines: engines.map(engineFrom).whereType<Engine>().toList(growable: false),
  );
}

/// Whether [value] is a list of strings.
bool _texts(Object? value) =>
    value is List<Object?> && value.every((Object? item) => item is String);
