/// The engines of the installation, as the screens read them (plan 28, B-13).
///
/// Read once per signed-in user and kept: the list changes with the configuration of the machine,
/// not while a screen is open. Signing in asks for it afresh, and signing out drops it with every
/// other user-scoped state.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'engine_catalogue.g.dart';

/// Never asked again on its own: until the list arrives, a sentence names an engine by its id, and
/// the next sign-in asks again. Riverpod retries a failed provider by default.
Duration? _neverRetry(int retryCount, Object error) => null;

/// The engines enabled, the default named, and what each can do.
@Riverpod(keepAlive: true, retry: _neverRetry)
Future<EngineCatalogue> engineCatalogue(Ref ref) => ref.watch(listEnginesProvider)();

/// What the engine of a session can do: what its `session.started` declared — or, before that
/// arrived, what the list says of its engine (plan 28, B-27). `null` while neither is known.
EngineCapabilities? sessionCapabilities(WidgetRef ref, SessionFacts facts) =>
    facts.capabilities ?? ref.watch(engineCatalogueProvider).value?.capabilitiesOf(facts.engine);

/// What the engine a draft will open on can do — [engine]'s, or the default's while nothing was
/// chosen (plan 28, B-45). `null` while the list is not known.
EngineCapabilities? draftCapabilities(WidgetRef ref, [String? engine]) =>
    ref.watch(engineCatalogueProvider).value?.capabilitiesOf(engine);

/// The modes of permission [can] offers — none while it is not known.
List<String> modesOf(EngineCapabilities? can) => can?.permissionModes ?? const <String>[];

/// The levels of effort [can] offers — none while it is not known.
List<String> levelsOf(EngineCapabilities? can) => can?.effortLevels ?? const <String>[];
