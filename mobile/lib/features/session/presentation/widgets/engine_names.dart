/// Puts the display names of the engines above every screen, for any sentence that names one
/// (plan 28, B-13; docs/architecture/shared/12-engines.md).
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';
import 'package:remote_claude/features/session/presentation/providers/engine_catalogue.dart';

/// [child], under the names of the engines the backend listed.
///
/// The list is asked for only with somebody signed in — before that the backend would refuse it —,
/// and until it arrives, or when it could not, a sentence names an engine by its id: never a gap,
/// and never a name the app made up.
class EngineNames extends ConsumerWidget {
  const EngineNames({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bool signedIn = ref.watch(
      authControllerProvider.select((AsyncValue<AuthSession?> auth) => auth.value != null),
    );
    final EngineCatalogue? catalogue = signedIn ? ref.watch(engineCatalogueProvider).value : null;

    return AgentNamesScope(
      names: catalogue == null
          ? AgentNames.none
          : AgentNames(names: catalogue.displayNames, defaultEngine: catalogue.defaultEngine),
      child: child,
    );
  }
}
