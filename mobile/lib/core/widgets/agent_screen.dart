/// The one screen an engine extension may add to the app (plan 28, D-15): a single slot, since only
/// one engine is enabled today — a second, concurrent one would need a list of slots, not this.
///
/// Set once by `app/engines.dart`, the one file allowed to import `engines/` (ADR-025). `core/` and
/// `features/` never import an engine, so the shell here says `{agent}` and never a motor's name;
/// what the slot itself shows is entirely the engine's to decide.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/empty_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// What the engine's own screen renders, once registered — `null` until `app/engines.dart` runs,
/// and in a test that never calls it.
WidgetBuilder? agentScreenBody;

/// The engine's own screen — a neutral shell around whatever [agentScreenBody] renders.
class AgentPage extends StatelessWidget {
  const AgentPage({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final WidgetBuilder? body = agentScreenBody;

    return AppScreen(
      title: l10n.agentScreenTitle(agentNameIn(context)),
      body: body == null
          ? EmptyView(title: l10n.agentScreenEmptyTitle, description: l10n.agentScreenEmptyBody)
          : Builder(builder: body),
    );
  }
}
