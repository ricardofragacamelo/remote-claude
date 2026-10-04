/// What the composer shows about an installation and a session without asking the model anything:
/// the models it can run, the use of its context window, and — before a session exists — its
/// catalogue.
///
/// Pure Dart. Every list here is the **installation's**, never one of ours: a model the app named
/// itself would be a model the machine might not have (plan 08, B-36).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';

/// One model the installation offers.
class InstallationModel extends Equatable {
  const InstallationModel({
    required this.value,
    this.displayName = '',
    this.description = '',
    this.effortLevels = const <String>[],
  });

  /// What `session.setModel` and `session.start.model` take.
  final String value;

  /// Data of the installation, shown as it is — like the description of a slash command.
  final String displayName;
  final String description;

  /// The effort levels it takes, in order. Empty: it takes none.
  final List<String> effortLevels;

  /// Whether an effort can be chosen for it at all.
  bool get supportsEffort => effortLevels.isNotEmpty;

  /// What to call it: the installation's name for it, or its value when it gave none.
  String get label => displayName.isEmpty ? value : displayName;

  @override
  List<Object?> get props => <Object?>[value, displayName, description, effortLevels];
}

/// The models of a live session's installation, and the one it runs.
class SessionModels extends Equatable {
  const SessionModels({required this.current, this.models = const <InstallationModel>[]});

  final String current;
  final List<InstallationModel> models;

  @override
  List<Object?> get props => <Object?>[current, models];
}

/// What a folder's installation offers a draft, before any session exists (plan 08, D-13).
class InstallationCatalog extends Equatable {
  const InstallationCatalog({
    this.commands = const CommandMenu(),
    this.models = const <InstallationModel>[],
  });

  final CommandMenu commands;
  final List<InstallationModel> models;

  @override
  List<Object?> get props => <Object?>[commands, models];
}

/// One category of the context window: the system prompt, the tools, the messages, the free space.
class ContextCategory extends Equatable {
  const ContextCategory({required this.id, required this.name, required this.tokens});

  /// A stable name the screen translates — `systemTools`, `messages`, `freeSpace`…
  final String id;

  /// The installation's own name, shown when this build has no words for [id].
  final String name;
  final int tokens;

  @override
  List<Object?> get props => <Object?>[id, name, tokens];
}

/// The use of a session's context window, against the window of its model.
class ContextUse extends Equatable {
  const ContextUse({
    required this.totalTokens,
    required this.maxTokens,
    required this.percentage,
    this.categories = const <ContextCategory>[],
  });

  final int totalTokens;
  final int maxTokens;

  /// How much of the window is used, from 0 to 100.
  final int percentage;
  final List<ContextCategory> categories;

  /// From here on, the ring warns and the sheet says compacting keeps the conversation going.
  static const int nearLimit = 80;

  /// Whether the conversation is near the limit of its context.
  bool get isNearLimit => percentage >= nearLimit;

  @override
  List<Object?> get props => <Object?>[totalTokens, maxTokens, percentage, categories];
}
