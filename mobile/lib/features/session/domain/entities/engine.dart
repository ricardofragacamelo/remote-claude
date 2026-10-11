/// The coding agents this installation drives, and what each can do.
///
/// Pure Dart. Capability is declared, never supposed (ADR-025): the backend says what an engine has
/// in `GET /engines` and, per session, in `session.started`. The app reads and keeps it; hiding the
/// controls of what an engine does not have is each control's own phase (plan 28, F3, F4).
library;

import 'package:equatable/equatable.dart';

/// The canonical mode of [mode] (plan 28, D-16): the name itself when it already is one of
/// `ask · acceptEdits · readOnly · allowAll`; the canonical name of what the previous protocol called
/// it — `default` is `ask`, `plan` is `readOnly`; and `null` for anything else, which is dropped rather
/// than offered. Read once, where a mode enters the app.
String? canonicalPermissionMode(String? mode) => switch (mode) {
  'ask' || 'acceptEdits' || 'readOnly' || 'allowAll' => mode,
  'default' => 'ask',
  'plan' => 'readOnly',
  _ => null,
};

/// What an engine — or the engine of one session — can do.
class EngineCapabilities extends Equatable {
  const EngineCapabilities({
    required this.resume,
    required this.fork,
    required this.history,
    required this.images,
    required this.promptWhileBusy,
    required this.questions,
    required this.planApproval,
    required this.taskList,
    required this.subagents,
    required this.thinking,
    required this.slashCommands,
    required this.modelSwitch,
    required this.effortLevels,
    required this.contextUse,
    required this.mcp,
    required this.compaction,
    required this.cost,
    required this.permissionModes,
  });

  /// A conversation can be continued where it stopped.
  final bool resume;

  /// A conversation can be forked at a message, whole, or not at all — as the contract words it.
  final String fork;

  /// The conversations of a folder can be listed and read back.
  final bool history;

  /// A prompt can carry images.
  final bool images;

  /// A prompt sent while a turn runs is queued.
  final bool promptWhileBusy;

  /// The agent asks the person a structured question.
  final bool questions;

  /// The agent asks for a plan to be approved before it acts.
  final bool planApproval;

  /// The agent keeps a list of tasks the person can follow.
  final bool taskList;

  /// The agent delegates to subagents.
  final bool subagents;

  /// The agent's reasoning streams as its own block.
  final bool thinking;

  /// The installation offers commands the composer lists.
  final bool slashCommands;

  /// The model can be switched while the session lives.
  final bool modelSwitch;

  /// The levels of effort the engine takes, in order — empty when it takes none.
  final List<String> effortLevels;

  /// The use of the context window can be asked.
  final bool contextUse;

  /// MCP servers can be given to the session.
  final bool mcp;

  /// The conversation can be compacted on request.
  final bool compaction;

  /// What a turn costs is reported, and in which unit — or not at all.
  final String cost;

  /// The modes of permission the engine runs in, in canonical names — the only ones a screen offers
  /// (plan 28, B-27).
  final List<String> permissionModes;

  @override
  List<Object?> get props => <Object?>[
    resume,
    fork,
    history,
    images,
    promptWhileBusy,
    questions,
    planApproval,
    taskList,
    subagents,
    thinking,
    slashCommands,
    modelSwitch,
    effortLevels,
    contextUse,
    mcp,
    compaction,
    cost,
    permissionModes,
  ];
}

/// One engine of the installation.
class Engine extends Equatable {
  const Engine({
    required this.id,
    required this.displayName,
    required this.isAvailable,
    required this.capabilities,
    this.reason,
    this.version,
  });

  /// The name the contract carries in `engine` and in every conversation.
  final String id;

  /// How a screen names it: a proper noun, never translated — the `{agent}` of a sentence.
  final String displayName;

  /// Whether it can open a session now.
  final bool isAvailable;

  /// Why it cannot, as a key to translate; `null` when it can.
  final String? reason;

  /// The version of what it drives, when it could tell.
  final String? version;

  final EngineCapabilities capabilities;

  @override
  List<Object?> get props => <Object?>[id, displayName, isAvailable, reason, version, capabilities];
}

/// Every engine enabled, the default first named.
class EngineCatalogue extends Equatable {
  const EngineCatalogue({required this.defaultEngine, this.engines = const <Engine>[]});

  /// The engine a session opens on when nobody names one.
  final String defaultEngine;

  /// In the order the configuration lists them.
  final List<Engine> engines;

  /// The engine [id] names, or `null` when none here has it.
  Engine? engineOf(String id) {
    for (final Engine engine in engines) {
      if (engine.id == id) {
        return engine;
      }
    }

    return null;
  }

  /// What the engine [engine] can do — the default engine's when [engine] is `null` —, or `null`
  /// when the list does not have it.
  EngineCapabilities? capabilitiesOf(String? engine) =>
      engineOf(engine ?? defaultEngine)?.capabilities;

  /// How a screen names [id]: its display name, or the id itself when the catalogue does not know
  /// it — an engine is never left unnamed.
  String displayNameOf(String id) => engineOf(id)?.displayName ?? id;

  /// Every engine's display name, by its id.
  Map<String, String> get displayNames => <String, String>{
    for (final Engine engine in engines) engine.id: engine.displayName,
  };

  @override
  List<Object?> get props => <Object?>[defaultEngine, engines];
}
