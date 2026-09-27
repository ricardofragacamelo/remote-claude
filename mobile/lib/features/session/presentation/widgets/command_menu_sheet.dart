/// The slash command menu: what the installation offers, searchable, with the suggested on top.
///
/// Discovery, not a boundary (D-05). Nothing here stands between the person and the prompt box:
/// the sheet opens over the composer, a menu that did not load says why and offers to read it
/// again, and the composer underneath accepts any text either way (S-31).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';
import 'package:remote_claude/features/session/presentation/providers/command_menu_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_sheet.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Opens the menu of [sessionId] and answers what picking a command puts in the prompt box, or
/// `null` when the menu was closed without picking one.
Future<String?> pickCommand(BuildContext context, String sessionId) async {
  final SlashCommand? picked = await showSessionSheet<SlashCommand>(
    context,
    CommandMenuSheet(sessionId: sessionId),
  );

  return picked?.invocation;
}

/// The menu of one session's installation, and what the person typed to search it.
class CommandMenuSheet extends ConsumerStatefulWidget {
  const CommandMenuSheet({required this.sessionId, super.key});

  /// The session whose installation is listed.
  final String sessionId;

  @override
  ConsumerState<CommandMenuSheet> createState() => _CommandMenuSheetState();
}

class _CommandMenuSheetState extends ConsumerState<CommandMenuSheet> {
  /// What the person typed. Local to the sheet: nobody else needs it, and it dies with the sheet.
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final CommandMenuControllerProvider menu = commandMenuControllerProvider(widget.sessionId);

    return SessionSheet(
      title: l10n.sessionCommandsTitle,
      description: l10n.sessionCommandsDescription,
      child: LoadedView<CommandMenu>(
        value: ref.watch(menu),
        labels: LoadedLabels(
          loading: l10n.sessionCommandsLoading,
          emptyTitle: l10n.sessionCommandsEmptyTitle,
          emptyDescription: l10n.sessionCommandsEmptyBody,
        ),
        isEmpty: (CommandMenu loaded) => loaded.isEmpty,
        onRetry: ref.read(menu.notifier).reload,
        builder: (CommandMenu loaded) => Column(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
              child: TextField(
                autofocus: true,
                decoration: InputDecoration(
                  labelText: l10n.sessionCommandsSearch,
                  prefixIcon: const Icon(Icons.search),
                  border: const OutlineInputBorder(),
                ),
                onChanged: (String query) => setState(() => _query = query),
              ),
            ),
            Expanded(
              child: _Found(found: loaded.search(_query), query: _query),
            ),
          ],
        ),
      ),
    );
  }
}

/// What the search found, in its two groups — or a sentence saying it found nothing.
class _Found extends StatelessWidget {
  const _Found({required this.found, required this.query});

  final CommandMenu found;
  final String query;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<SlashCommand> suggested = found.suggested;
    final List<SlashCommand> others = found.others;

    if (found.isEmpty) {
      return ContentColumn(children: <Widget>[Text(l10n.sessionCommandsNoMatch(query.trim()))]);
    }

    return ListView(
      children: <Widget>[
        if (suggested.isNotEmpty) ...<Widget>[
          _Heading(l10n.sessionCommandsSuggested),
          for (final SlashCommand command in suggested) _CommandTile(command: command),
        ],
        if (others.isNotEmpty) ...<Widget>[
          _Heading(l10n.sessionCommandsAll),
          for (final SlashCommand command in others) _CommandTile(command: command),
        ],
      ],
    );
  }
}

/// The name of one group.
class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(Tokens.spaceMd, Tokens.spaceMd, Tokens.spaceMd, 0),
    child: SheetHeading(text),
  );
}

/// One command: how it is typed, how its argument is written, and what it does.
///
/// Picking it closes the menu with it; the composer is what puts it in the prompt box.
class _CommandTile extends StatelessWidget {
  const _CommandTile({required this.command});

  final SlashCommand command;

  @override
  Widget build(BuildContext context) {
    final String hint = command.argumentHint;

    return ListTile(
      title: Text(
        hint.isEmpty ? '/${command.name}' : '/${command.name} $hint',
        style: Theme.of(context).textTheme.bodyLarge?.copyWith(fontFamily: 'monospace'),
      ),
      subtitle: command.description.isEmpty ? null : Text(command.description),
      onTap: () => Navigator.of(context).pop(command),
    );
  }
}
