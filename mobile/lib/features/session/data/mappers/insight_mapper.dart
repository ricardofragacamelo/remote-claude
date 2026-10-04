/// Reads `GET /catalog`, `GET /sessions/:id/models` and `GET /sessions/:id/context` as entities.
///
/// The only file that knows both those bodies and the entities. A field of the wrong kind is read
/// as absent, never guessed: a model nobody can name is not one to offer, and a measure that is not
/// a number is not one to draw.
library;

import 'package:remote_claude/features/session/data/mappers/command_menu_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';

/// The catalogue in [body], or `null` when the body is not one.
InstallationCatalog? catalogFrom(Object? body) {
  if (body is! Map<String, Object?> || body['models'] is! List<Object?>) {
    return null;
  }

  return InstallationCatalog(
    commands: commandMenuFrom(body) ?? const CommandMenu(),
    models: _modelsIn(body['models']),
  );
}

/// The models in [body], or `null` when the body is not that answer.
SessionModels? sessionModelsFrom(Object? body) {
  if (body is! Map<String, Object?> || body['current'] is! String) {
    return null;
  }

  return SessionModels(current: body['current']! as String, models: _modelsIn(body['models']));
}

/// The use of the context in [body], or `null` when the body is not one.
ContextUse? contextUseFrom(Object? body) {
  if (body is! Map<String, Object?>) {
    return null;
  }

  final Object? total = body['totalTokens'];
  final Object? max = body['maxTokens'];
  final Object? percentage = body['percentage'];

  if (total is! num || max is! num || percentage is! num) {
    return null;
  }

  final Object? categories = body['categories'];

  return ContextUse(
    totalTokens: total.round(),
    maxTokens: max.round(),
    percentage: percentage.round().clamp(0, 100),
    categories: <ContextCategory>[
      if (categories is List<Object?>)
        for (final Object? entry in categories) ?_categoryOf(entry),
    ],
  );
}

List<InstallationModel> _modelsIn(Object? list) => <InstallationModel>[
  if (list is List<Object?>)
    for (final Object? entry in list) ?_modelOf(entry),
];

InstallationModel? _modelOf(Object? entry) {
  if (entry is! Map<String, Object?> || entry['value'] is! String) {
    return null;
  }

  final Object? levels = entry['supportedEffortLevels'];

  return InstallationModel(
    value: entry['value']! as String,
    displayName: _text(entry, 'displayName'),
    description: _text(entry, 'description'),
    effortLevels: entry['supportsEffort'] == true && levels is List<Object?>
        ? levels.whereType<String>().toList(growable: false)
        : const <String>[],
  );
}

ContextCategory? _categoryOf(Object? entry) {
  if (entry is! Map<String, Object?> || entry['tokens'] is! num) {
    return null;
  }

  return ContextCategory(
    id: _text(entry, 'id'),
    name: _text(entry, 'name'),
    tokens: (entry['tokens']! as num).round(),
  );
}

String _text(Map<String, Object?> entry, String key) {
  final Object? value = entry[key];
  return value is String ? value : '';
}
