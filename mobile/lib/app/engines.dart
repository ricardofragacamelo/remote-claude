/// The composition of the engine extensions of the app (ADR-025): the one file of the app that may
/// import `engines/`, to register an extension into the registries of the core.
///
/// The rules of `analysis_options.yaml` already refuse the core and every feature importing
/// `engines/`, so this is the only place an extension's screen reaches the app's navigation.
library;

import 'package:remote_claude/core/widgets/agent_screen.dart';
import 'package:remote_claude/engines/claude/usage/presentation/pages/claude_usage_view.dart';

/// Puts Claude's own screen in the app's single agent-screen slot (plan 16, D-09; plan 28, D-15).
/// Called once, from `main()`, before the first frame.
void registerEngines() {
  agentScreenBody = (_) => const ClaudeUsageView();
}
