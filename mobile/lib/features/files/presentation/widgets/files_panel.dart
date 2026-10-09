/// The side panel of the open folder's files (plan 25, B-10…B-12).
///
/// On the right (`endDrawer`, D-01), opened by its button on the bar — never by a swipe, for the
/// reason the sessions' panel gives: both edges are Android's "back". One level at a time, with a
/// breadcrumb (D-04); folders first, in the server's order; the hidden names behind the `⋮`; a link
/// that leaves the folder, or leads nowhere, shown and inert, saying why. Pressing and holding an
/// entry offers what can be done with it, and the same is a `Semantics` action of the row.
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/byte_size.dart';
import 'package:remote_claude/core/widgets/failure_line.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/services/visible_entries.dart';
import 'package:remote_claude/features/files/presentation/providers/folder_tree_controller.dart';
import 'package:remote_claude/features/files/presentation/widgets/downloads.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The widest the panel gets, whatever the screen.
const double filesPanelMaxWidth = 400;

/// The share of the screen the panel takes, below [filesPanelMaxWidth].
const double filesPanelShare = 0.85;

/// The last segment of [folder], as the folders home names it.
String folderNameOf(String folder) {
  final Iterable<String> segments = folder.split('/').where((String each) => each.isNotEmpty);
  return segments.isEmpty ? folder : segments.last;
}

/// The panel of [folder].
class FilesPanel extends ConsumerStatefulWidget {
  const FilesPanel({required this.folder, super.key, this.sessionId, this.onOpenFile});

  final String folder;

  /// The session the panel is on, if any — the viewer says when Claude waits in it (D-11).
  final String? sessionId;

  /// What a tap on a file does — the viewer, unless a test says otherwise.
  final void Function(FileEntry file)? onOpenFile;

  /// The bar's way into the panel: an outlined tree, a tooltip, a 48 dp target (D-03).
  static Widget button() => Builder(
    builder: (BuildContext context) => IconButton(
      tooltip: AppLocalizations.of(context).filesPanelOpen,
      icon: const Icon(Icons.account_tree_outlined),
      onPressed: () => Scaffold.of(context).openEndDrawer(),
    ),
  );

  @override
  ConsumerState<FilesPanel> createState() => _FilesPanelState();
}

class _FilesPanelState extends ConsumerState<FilesPanel> {
  /// A viewer is being opened: a second tap does not stack another (S-52).
  bool _opening = false;

  FolderTreeController get _tree => ref.read(folderTreeControllerProvider(widget.folder).notifier);

  @override
  void initState() {
    super.initState();
    // Opened again on a level it already read: read it again behind what is shown (S-39).
    // After the frame: a provider is not changed while the panel builds.
    if (ref.read(folderTreeControllerProvider(widget.folder)).listing != null) {
      WidgetsBinding.instance.addPostFrameCallback((Duration _) {
        if (mounted) {
          unawaited(_tree.refresh());
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final FolderTree tree = ref.watch(folderTreeControllerProvider(widget.folder));
    final double width = math.min(
      MediaQuery.sizeOf(context).width * filesPanelShare,
      filesPanelMaxWidth,
    );

    return Drawer(
      width: width,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            _Heading(folder: widget.folder, tree: tree, controller: _tree),
            _Breadcrumb(folder: widget.folder, path: tree.path, onOpen: _tree.open),
            const DownloadsStrip(),
            const Divider(height: 1),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _tree.refresh,
                child: ListView(
                  children: <Widget>[
                    ..._state(l10n, tree),
                    if (tree.listing != null && parentOf(tree.path) != null)
                      _UpRow(onTap: () => unawaited(_tree.open(parentOf(tree.path) ?? ''))),
                    ..._rows(tree),
                    if (tree.listing?.truncated ?? false)
                      _Truncated(count: tree.listing!.entries.length),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Opens [file] in the viewer, stacked over the screen — once, however many taps (S-52).
  Future<void> _open(FileEntry file) async {
    final void Function(FileEntry file)? open = widget.onOpenFile;
    if (open != null) {
      open(file);
      return;
    }
    if (_opening) {
      return;
    }

    _opening = true;
    try {
      // The panel steps aside: "back" — and "back to the session" — lands on the screen itself,
      // with its cards in reach; the level stays where it was, for the next time it opens (D-33).
      final Future<void> opened = context.push<void>(
        viewerRouteFor(widget.folder, file.path, sessionId: widget.sessionId),
      );
      Scaffold.maybeOf(context)?.closeEndDrawer();
      await opened;
    } finally {
      _opening = false;
    }
  }

  /// The line of the state the level is in — reading, refused, empty —, or nothing (S-34).
  List<Widget> _state(AppLocalizations l10n, FolderTree tree) {
    final Failure? failure = tree.failure;
    final FileListing? listing = tree.listing;

    if (failure != null) {
      return <Widget>[_FailureRow(failure: failure, path: tree.path, controller: _tree)];
    }
    if (listing == null) {
      return <Widget>[_Line(text: l10n.filesPanelLoading, busy: true)];
    }
    if (visibleEntries(listing, showHidden: tree.showHidden).isEmpty) {
      return <Widget>[_Line(text: l10n.filesPanelEmpty)];
    }
    return const <Widget>[];
  }

  List<Widget> _rows(FolderTree tree) {
    final FileListing? listing = tree.listing;
    if (listing == null) {
      return const <Widget>[];
    }

    return <Widget>[
      for (final FileEntry entry in visibleEntries(listing, showHidden: tree.showHidden))
        _EntryRow(
          folder: widget.folder,
          entry: entry,
          onTap: () {
            if (entry.isFolder) {
              unawaited(_tree.open(entry.path));
            } else {
              unawaited(_open(entry));
            }
          },
        ),
    ];
  }
}

/// The name of the folder, and the `⋮` of the panel: hidden names, and reading again.
class _Heading extends StatelessWidget {
  const _Heading({required this.folder, required this.tree, required this.controller});

  final String folder;
  final FolderTree tree;
  final FolderTreeController controller;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Row(
      children: <Widget>[
        const SizedBox(width: Tokens.spaceMd),
        Expanded(
          child: Semantics(
            header: true,
            child: Text(
              l10n.filesPanelTitle,
              style: Theme.of(context).textTheme.titleMedium,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
        PopupMenuButton<_Option>(
          tooltip: l10n.filesPanelMenu,
          onSelected: (_Option option) => switch (option) {
            _Option.hidden => controller.toggleHidden(),
            _Option.refresh => unawaited(controller.refresh()),
          },
          itemBuilder: (BuildContext _) => <PopupMenuEntry<_Option>>[
            CheckedPopupMenuItem<_Option>(
              value: _Option.hidden,
              checked: tree.showHidden,
              child: Text(l10n.filesPanelShowHidden),
            ),
            PopupMenuItem<_Option>(value: _Option.refresh, child: Text(l10n.filesPanelRefresh)),
          ],
        ),
      ],
    );
  }
}

enum _Option { hidden, refresh }

/// The steps from the folder to the level, each a way back to it (S-31).
class _Breadcrumb extends StatelessWidget {
  const _Breadcrumb({required this.folder, required this.path, required this.onOpen});

  final String folder;
  final String path;
  final Future<void> Function(String path) onOpen;

  @override
  Widget build(BuildContext context) {
    final List<({String name, String path})> steps = breadcrumbOf(path);

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceSm),
      child: Row(
        children: <Widget>[
          for (final (int index, ({String name, String path}) step) in steps.indexed) ...<Widget>[
            if (index > 0) const Icon(Icons.chevron_right, size: Tokens.spaceMd),
            TextButton(
              onPressed: step.path == path ? null : () => unawaited(onOpen(step.path)),
              child: Text(index == 0 ? folderNameOf(folder) : step.name),
            ),
          ],
        ],
      ),
    );
  }
}

/// ".." — the level above.
class _UpRow extends StatelessWidget {
  const _UpRow({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    label: AppLocalizations.of(context).filesPanelUp,
    excludeSemantics: true,
    button: true,
    child: ListTile(leading: const Icon(Icons.arrow_upward), title: const Text('..'), onTap: onTap),
  );
}

/// One entry: its icon, its name, its size or why it does not open.
class _EntryRow extends StatelessWidget {
  const _EntryRow({required this.folder, required this.entry, required this.onTap});

  final String folder;
  final FileEntry entry;

  /// A file that opens is a file that downloads; a folder is not downloaded (D-13), nor is what
  /// does not open.
  bool get _downloads => !entry.isFolder && entry.inert == null;

  DownloadRequest get _request =>
      DownloadRequest(folder: folder, path: entry.path, size: entry.size);
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String? why = inertReason(l10n, entry.inert);
    final String? detail =
        why ??
        (entry.isFolder
            ? null
            : formatBytes(entry.size, Localizations.localeOf(context).toLanguageTag()));

    return Semantics(
      customSemanticsActions: <CustomSemanticsAction, VoidCallback>{
        CustomSemanticsAction(label: l10n.filesEntryCopyPath): () => unawaited(_copy(context)),
        if (_downloads)
          CustomSemanticsAction(label: l10n.filesDownload): () =>
              unawaited(startDownload(context, _request)),
      },
      child: ListTile(
        leading: Icon(_iconOf(entry)),
        title: Text(entry.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: detail == null
            ? null
            : Text(detail, maxLines: 2, overflow: TextOverflow.ellipsis),
        onTap: why == null ? onTap : () => _say(context, why),
        onLongPress: () => unawaited(_actions(context)),
      ),
    );
  }

  /// The actions of the entry, in a sheet.
  Future<void> _actions(BuildContext context) => showSheet<void>(
    context,
    (BuildContext sheet) => Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        ListTile(title: Text(entry.path, maxLines: 2, overflow: TextOverflow.ellipsis)),
        ListTile(
          leading: const Icon(Icons.copy),
          title: Text(AppLocalizations.of(sheet).filesEntryCopyPath),
          onTap: () {
            Navigator.of(sheet).pop();
            unawaited(_copy(context));
          },
        ),
        if (_downloads)
          ListTile(
            leading: const Icon(Icons.download),
            title: Text(AppLocalizations.of(sheet).filesDownload),
            onTap: () {
              Navigator.of(sheet).pop();
              unawaited(startDownload(context, _request));
            },
          ),
      ],
    ),
  );

  /// Puts the path relative to the folder on the clipboard, and says so (S-42).
  Future<void> _copy(BuildContext context) async {
    final ScaffoldMessengerState? messenger = ScaffoldMessenger.maybeOf(context);
    final String copied = AppLocalizations.of(context).filesEntryPathCopied;

    await Clipboard.setData(ClipboardData(text: entry.path));
    messenger?.showSnackBar(SnackBar(content: Text(copied)));
  }

  void _say(BuildContext context, String why) =>
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(why)));
}

/// Why an entry does not open, in words — `null` when it does (S-36).
String? inertReason(AppLocalizations l10n, Inert? inert) => switch (inert) {
  Inert.outsideLink => l10n.filesPanelOutsideLink,
  Inert.brokenLink => l10n.filesPanelBrokenLink,
  Inert.unreadableName => l10n.filesPanelUnreadableName,
  Inert.notAFile => l10n.filesPanelNotAFile,
  null => null,
};

IconData _iconOf(FileEntry entry) {
  if (entry.inert != null) {
    return Icons.link_off;
  }
  if (entry.isFolder) {
    return entry.isLink ? Icons.folder_special_outlined : Icons.folder_outlined;
  }
  return entry.isLink ? Icons.link : Icons.description_outlined;
}

/// One line of state: reading, or empty — announced, a bar under it while it reads.
class _Line extends StatelessWidget {
  const _Line({required this.text, this.busy = false});

  final String text;
  final bool busy;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: ListTile(title: Text(text), subtitle: busy ? const LinearProgressIndicator() : null),
  );
}

/// Why the level was not read, and what to do: try again; back to the folder when the level is
/// gone (S-40); what the person does about a phone not approved, or revoked (S-152).
class _FailureRow extends StatelessWidget {
  const _FailureRow({required this.failure, required this.path, required this.controller});

  final Failure failure;
  final String path;
  final FolderTreeController controller;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String? device = switch (failure.code) {
      'DEVICE_NOT_REGISTERED' => l10n.filesPanelDevicePending,
      'DEVICE_REVOKED' => l10n.filesPanelDeviceRevoked,
      _ => null,
    };
    final bool gone = failure.code == 'FILE_NOT_FOUND' && path.isNotEmpty;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (device == null)
            FailureLine(failure: failure)
          else
            Semantics(
              liveRegion: true,
              child: Padding(
                padding: const EdgeInsets.only(top: Tokens.spaceSm),
                child: Text(device),
              ),
            ),
          Wrap(
            spacing: Tokens.spaceSm,
            children: <Widget>[
              if (failure.code != 'DEVICE_REVOKED')
                TextButton(
                  onPressed: () => unawaited(controller.refresh()),
                  child: Text(l10n.commonActionRetry),
                ),
              if (gone)
                TextButton(
                  onPressed: () => unawaited(controller.open('')),
                  child: Text(l10n.filesPanelBackToRoot),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The server listed only the first part of the level (S-35).
class _Truncated extends StatelessWidget {
  const _Truncated({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final String locale = Localizations.localeOf(context).toLanguageTag();

    return _Line(
      text: AppLocalizations.of(
        context,
      ).filesPanelTruncated(NumberFormat.decimalPattern(locale).format(count)),
    );
  }
}
