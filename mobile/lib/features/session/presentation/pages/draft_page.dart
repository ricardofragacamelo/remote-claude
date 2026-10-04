/// A new conversation in one folder, before it is a session — the draft (plan 10, B-08, D-05).
///
/// The frame of every conversation: the hints in the place of the conversation, the box anchored
/// under them, and the chips of what the session will start with — the model, the mode and the
/// effort, from the folder's catalogue. Nothing runs until the first send: then the session opens
/// with what was chosen, the prompt goes to it, and the screen moves there. A catalogue that could
/// not be read says why and changes nothing about sending: the installation's defaults are used
/// (S-21).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/note_line.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/presentation/providers/draft_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/insight_controllers.dart';
import 'package:remote_claude/features/session/presentation/widgets/chat_composer.dart';
import 'package:remote_claude/features/session/presentation/widgets/command_menu_sheet.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_choices.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_frame.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_menu.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_strips.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The draft of [workspacePath].
class DraftPage extends ConsumerStatefulWidget {
  const DraftPage({required this.workspacePath, super.key});

  /// The folder the conversation will run in. It comes from the route.
  final String workspacePath;

  @override
  ConsumerState<DraftPage> createState() => _DraftPageState();
}

class _DraftPageState extends ConsumerState<DraftPage> with BoxOwner<DraftPage> {
  @override
  Widget build(BuildContext context) {
    final String path = widget.workspacePath;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Draft draft = ref.watch(draftControllerProvider(path));
    final DraftController drafts = ref.read(draftControllerProvider(path).notifier);
    final AsyncValue<InstallationCatalog> catalog = ref.watch(catalogControllerProvider(path));
    final List<InstallationModel> known = catalog.value?.models ?? const <InstallationModel>[];
    final ConnectionStatus connection = connectionOf(ref.watch(connectionStatusProvider));

    // The session answers on the socket, not from the command: the screen moves when it opened.
    ref.listen<Draft>(draftControllerProvider(path), (Draft? previous, Draft next) {
      final String? sessionId = next.sessionId;

      if (sessionId != null && previous?.sessionId != sessionId) {
        context.go(sessionRouteFor(sessionId));
      }
    });

    final Failure? refused = draft.failure;

    return AppScreen(
      title: l10n.draftTitle,
      // No session yet: only what is the screen's — the rules and the help (S-51).
      actions: const <Widget>[SessionMenuButton()],
      body: SessionFrame(
        top: <Widget>[
          ConnectionStrip(status: connection),
          const DeviceStatusLine(),
          const PushReachLine(),
        ],
        body: _Hints(path: path, catalog: catalog),
        aboveBox: <Widget>[
          if (refused != null) RefusalStrip(failure: refused, onClose: drafts.dismiss),
          if (connection != ConnectionStatus.ready && connection != ConnectionStatus.connecting)
            BlockedStrip(reason: connectionLabel(l10n, connection)),
        ],
        composer: ChatComposer(
          controller: box,
          state: ComposerState(
            isEnabled: connection == ConnectionStatus.ready,
            isBusy: draft.isStarting,
            busyLabel: l10n.draftStarting,
          ),
          onSend: (String text) => drafts.send(text) ? SendOutcome.pending : SendOutcome.notSent,
          onOpenCommands: (String query) => pickCommand(context, workspacePath: path, query: query),
          mode: modeChoice(
            context,
            current: draft.choices.permissionMode,
            onPick: drafts.chooseMode,
          ),
          choices: <ComposerChoice>[
            modelChoice(
              context,
              current: draft.choices.model,
              known: known,
              withDefault: true,
              models: (WidgetRef ref) => ref
                  .watch(catalogControllerProvider(path))
                  .whenData((InstallationCatalog listed) => listed.models),
              onPick: drafts.chooseModel,
            ),
            ?effortChoice(
              context,
              model: modelOf(known, draft.choices.model),
              current: draft.choices.effort,
              onPick: drafts.chooseEffort,
            ),
          ],
        ),
      ),
    );
  }
}

/// What a draft is, and what the box can do — in the place the conversation will be.
class _Hints extends StatelessWidget {
  const _Hints({required this.path, required this.catalog});

  final String path;
  final AsyncValue<InstallationCatalog> catalog;

  @override
  Widget build(BuildContext context) {
    final Object? failure = catalog.error;
    final bool noModels = catalog.value?.models.isEmpty ?? false;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ThemeData theme = Theme.of(context);

    return SingleChildScrollView(
      child: ContentColumn(
        children: <Widget>[
          Text(l10n.draftTitle, style: theme.textTheme.titleLarge),
          Text(path, style: theme.textTheme.bodySmall),
          NoteLine(l10n.draftDescription, style: theme.textTheme.bodyMedium),
          NoteLine(l10n.draftCommands),
          if (noModels) NoteLine(l10n.draftDefaultModel),
          if (failure != null)
            NoteLine(
              l10n.draftCatalogFailed(
                failure is Failure ? translateFailure(l10n, failure) : l10n.commonErrorUnexpected,
              ),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
            ),
        ],
      ),
    );
  }
}
