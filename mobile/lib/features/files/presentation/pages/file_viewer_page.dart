/// One file of the folder, read on the phone — never edited (plan 25, B-14…B-18).
///
/// A page stacked over the screen it opened from: "back" returns there as it was, and a session
/// under it keeps its stream. The extension picks the viewer and the server's type confirms it
/// (S-48). The text is read again — with its version, so an unchanged file costs a `304` and
/// nothing moves — when the app comes back to the front, when another page over it goes, and on
/// "refresh" (D-15).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/page_observer.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/byte_size.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/core/widgets/zoomable_image.dart';
import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/domain/entities/viewer_kind.dart';
import 'package:remote_claude/features/files/domain/services/viewer_for.dart';
import 'package:remote_claude/features/files/presentation/providers/file_view_controllers.dart';
import 'package:remote_claude/features/files/presentation/widgets/claude_waiting_strip.dart';
import 'package:remote_claude/features/files/presentation/widgets/downloads.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/markdown_viewer.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/no_preview.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/pdf_viewer.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/text_viewer.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The viewer of [path] in [folder], opened from [sessionId] when a session opened it.
class FileViewerPage extends ConsumerStatefulWidget {
  const FileViewerPage({required this.folder, required this.path, super.key, this.sessionId});

  final String folder;
  final String path;
  final String? sessionId;

  @override
  ConsumerState<FileViewerPage> createState() => _FileViewerPageState();
}

class _FileViewerPageState extends ConsumerState<FileViewerPage>
    with RouteAware, PageAware<FileViewerPage> {
  late final ViewerKind _kind = viewerFor(widget.path);

  /// Back in front: the file may have changed meanwhile.
  late final AppLifecycleListener _lifecycle = AppLifecycleListener(onShow: _reload);

  bool get _isText => _kind == ViewerKind.text || _kind == ViewerKind.markdown;

  /// A markdown file shows its source instead of its preview (S-81).
  bool _source = false;

  @override
  void initState() {
    super.initState();
    _lifecycle;
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  /// Back from a page over this one: the file may have changed meanwhile.
  @override
  void didPopNext() => _reload();

  void _reload() {
    if (_isText) {
      unawaited(ref.read(textFileControllerProvider(widget.folder, widget.path).notifier).reload());
    }
  }

  @override
  Widget build(BuildContext context) {
    final String? session = widget.sessionId;

    return AppScreen(
      title: widget.path.split('/').last,
      subtitle: widget.path,
      actions: <Widget>[
        if (_kind == ViewerKind.markdown) _sourceToggle(AppLocalizations.of(context)),
        IconButton(
          tooltip: AppLocalizations.of(context).filesDownload,
          icon: const Icon(Icons.download),
          onPressed: () => unawaited(startDownload(context, _request())),
        ),
        _ViewerMenu(folder: widget.folder, path: widget.path, kind: _kind),
      ],
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (session != null) ClaudeWaitingStrip(sessionId: session),
          const DownloadsStrip(),
          Expanded(child: _body(context)),
        ],
      ),
    );
  }

  /// This file, as a download — with its size when the text already said it (S-127).
  DownloadRequest _request() => DownloadRequest(
    folder: widget.folder,
    path: widget.path,
    size: _isText
        ? ref.read(textFileControllerProvider(widget.folder, widget.path)).document?.size
        : null,
  );

  /// Preview ↔ source, on the bar.
  Widget _sourceToggle(AppLocalizations l10n) => IconButton(
    tooltip: _source ? l10n.markdownPreview : l10n.markdownSource,
    icon: Icon(_source ? Icons.visibility_outlined : Icons.code),
    onPressed: () => setState(() => _source = !_source),
  );

  Widget _body(BuildContext context) => switch (_kind) {
    ViewerKind.text || ViewerKind.markdown => _TextBody(
      folder: widget.folder,
      path: widget.path,
      preview: _kind == ViewerKind.markdown && !_source,
      sessionId: widget.sessionId,
    ),
    ViewerKind.image => _ImageBody(folder: widget.folder, path: widget.path),
    ViewerKind.pdf => PdfFileViewer(
      folder: widget.folder,
      path: widget.path,
      sessionId: widget.sessionId,
    ),
  };
}

/// What fills the viewer: one file of one folder.
abstract class _FileBody extends ConsumerWidget {
  const _FileBody({required this.folder, required this.path});

  final String folder;
  final String path;

  /// "Download" this file, for the states that show none of it.
  Widget get download => DownloadButton(
    request: DownloadRequest(folder: folder, path: path),
  );
}

/// The text of the file, its strips and its states.
class _TextBody extends _FileBody {
  const _TextBody({
    required super.folder,
    required super.path,
    required this.preview,
    this.sessionId,
  });

  /// The markdown preview, rather than the text.
  final bool preview;

  /// The session the viewer was opened from — where a link of the preview keeps the viewer.
  final String? sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextView view = ref.watch(textFileControllerProvider(folder, path));
    final TextDocument? document = view.document;
    final TextFileController controller = ref.read(
      textFileControllerProvider(folder, path).notifier,
    );

    if (document == null) {
      final failure = view.failure;
      return failure == null
          ? LoadingView(label: l10n.fileViewerLoading)
          : FileRefusal.of(
              context,
              failure,
              onRetry: () => unawaited(controller.reload()),
              onBack: () => context.pop(),
              download: download,
            );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (view.changed)
          TextStrip(
            icon: Icons.update,
            text: l10n.fileViewerChanged,
            action: IconButton(
              tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
              icon: const Icon(Icons.close),
              onPressed: controller.dismissChanged,
            ),
          ),
        if (document.largeFile)
          TextStrip(
            icon: Icons.info_outline,
            text: l10n.fileViewerLarge(
              formatBytes(document.size, Localizations.localeOf(context).toLanguageTag()),
            ),
          ),
        Expanded(
          child: preview
              ? MarkdownViewer(
                  folder: folder,
                  path: path,
                  content: document.content,
                  sessionId: sessionId,
                )
              : TextViewer(content: document.content, wrap: ref.watch(wrapSettingProvider)),
        ),
      ],
    );
  }
}

/// An image of the folder, zoomable — once the server's type says it is one (S-48).
class _ImageBody extends _FileBody {
  const _ImageBody({required super.folder, required super.path});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<RawBytes> raw = watchRawBytes(ref, folder, path);
    final AppLocalizations l10n = AppLocalizations.of(context);

    if (raw.value case (
      bytes: _,
      :final String? contentType,
    ) when !confirms(ViewerKind.image, contentType)) {
      return FileRefusal(message: l10n.fileViewerNoPreview, actions: <Widget>[download]);
    }

    return ZoomableImage(
      image: raw.whenData((RawBytes value) => value.bytes),
      semanticLabel: l10n.fileViewerImage(path.split('/').last),
      loadingLabel: l10n.fileViewerLoading,
      onRetry: () => unawaited(ref.read(rawFileControllerProvider(folder, path).notifier).retry()),
      finalCodes: const <String>{'FILE_NOT_FOUND', 'FILE_TOO_LARGE', 'FILE_ACCESS_DENIED'},
    );
  }
}

enum _Option { wrap, copyAll, refresh }

/// The `⋯` of the viewer: what the kind of file offers.
class _ViewerMenu extends ConsumerWidget {
  const _ViewerMenu({required this.folder, required this.path, required this.kind});

  final String folder;
  final String path;
  final ViewerKind kind;

  bool get _isText => kind == ViewerKind.text || kind == ViewerKind.markdown;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return PopupMenuButton<_Option>(
      tooltip: l10n.fileViewerMenu,
      icon: const Icon(Icons.more_vert),
      onSelected: (_Option option) => _pick(context, ref, option),
      itemBuilder: (BuildContext _) => <PopupMenuEntry<_Option>>[
        if (_isText)
          CheckedPopupMenuItem<_Option>(
            value: _Option.wrap,
            checked: ref.read(wrapSettingProvider),
            child: Text(l10n.fileViewerWrap),
          ),
        if (_isText)
          PopupMenuItem<_Option>(value: _Option.copyAll, child: Text(l10n.fileViewerCopyAll)),
        PopupMenuItem<_Option>(value: _Option.refresh, child: Text(l10n.filesPanelRefresh)),
      ],
    );
  }

  void _pick(BuildContext context, WidgetRef ref, _Option option) {
    switch (option) {
      case _Option.wrap:
        unawaited(ref.read(wrapSettingProvider.notifier).toggle());
      case _Option.copyAll:
        unawaited(_copyAll(context, ref));
      case _Option.refresh:
        if (_isText) {
          unawaited(ref.read(textFileControllerProvider(folder, path).notifier).reload());
        } else {
          unawaited(ref.read(rawFileControllerProvider(folder, path).notifier).retry());
        }
    }
  }

  /// Copies the whole file — not only what is on screen (S-60).
  Future<void> _copyAll(BuildContext context, WidgetRef ref) async {
    final ScaffoldMessengerState? messenger = ScaffoldMessenger.maybeOf(context);
    final String copied = AppLocalizations.of(context).fileViewerCopied;
    final String content =
        ref.read(textFileControllerProvider(folder, path)).document?.content ?? '';

    await Clipboard.setData(ClipboardData(text: content));
    messenger?.showSnackBar(SnackBar(content: Text(copied)));
  }
}
