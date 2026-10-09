/// A PDF of the folder, as the phone reads it (plan 25, B-24, B-25).
///
/// Page after page, with the engine's pinch, double tap and drag; "page N of M" over it, and "go to
/// page", which takes 1 to M and nothing else (S-111). A link goes by the rule of every link of a
/// file (S-113). A document with a password asks for it in a sheet: a wrong one says so and asks
/// again; cancelled, the viewer says the document is protected, and offers the sheet again.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/presentation/engines/pdf_engine.dart';
import 'package:remote_claude/features/files/presentation/providers/pdf_controller.dart';
import 'package:remote_claude/features/files/presentation/widgets/downloads.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/no_preview.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/open_link.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The PDF at [path] in [folder].
class PdfFileViewer extends ConsumerStatefulWidget {
  const PdfFileViewer({required this.path, required this.folder, this.sessionId, super.key});

  /// The file, relative to [folder].
  final String path;

  /// The folder the file is read from.
  final String folder;

  /// The session the viewer was opened from — where a link of the document keeps the viewer.
  final String? sessionId;

  @override
  ConsumerState<PdfFileViewer> createState() => _PdfFileViewerState();
}

class _PdfFileViewerState extends ConsumerState<PdfFileViewer> {
  PdfDocumentController get _controller =>
      ref.read(pdfDocumentControllerProvider(widget.folder, widget.path).notifier);

  /// A sheet is up: the next locked answer does not open a second one.
  bool _asking = false;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final PdfView view = ref.watch(pdfDocumentControllerProvider(widget.folder, widget.path));

    ref.listen<PdfView>(pdfDocumentControllerProvider(widget.folder, widget.path), (
      _,
      PdfView next,
    ) {
      final PdfOpening? opening = next.opening;
      if (opening is PdfLocked || opening is PdfWrongPassword) {
        unawaited(_askPassword(wrong: opening is PdfWrongPassword));
      }
    });

    final Widget download = DownloadButton(
      request: DownloadRequest(folder: widget.folder, path: widget.path),
    );
    final failure = view.failure;
    if (failure != null) {
      return FileRefusal.of(context, failure, onRetry: () => unawaited(_controller.retry()));
    }

    return switch (view.opening) {
      null => LoadingView(label: l10n.fileViewerLoading),
      PdfOpened(:final PdfHandle handle) => _Document(
        handle: handle,
        page: view.page,
        hooks: PdfHooks(
          onPage: _controller.pageChanged,
          onLink: (String address) => unawaited(
            followLink(
              context,
              folder: widget.folder,
              from: widget.path,
              href: address,
              sessionId: widget.sessionId,
            ),
          ),
        ),
      ),
      PdfLocked() || PdfWrongPassword() => FileRefusal(
        message: l10n.pdfProtected,
        actions: <Widget>[
          TextButton(
            onPressed: () => unawaited(_askPassword(wrong: false)),
            child: Text(l10n.pdfEnterPassword),
          ),
          download,
        ],
      ),
      PdfBroken() => FileRefusal(message: l10n.pdfCorrupt, actions: <Widget>[download]),
      PdfNotPdf() => FileRefusal(message: l10n.fileViewerNoPreview, actions: <Widget>[download]),
    };
  }

  /// The sheet of the password; what is typed goes to the engine, and is forgotten (S-118).
  Future<void> _askPassword({required bool wrong}) async {
    if (_asking) {
      return;
    }
    _asking = true;
    final String? password = await showSheet<String>(
      context,
      (BuildContext sheet) => _PasswordSheet(wrong: wrong),
    );
    _asking = false;
    if (password != null && mounted) {
      await _controller.unlock(password);
    }
  }
}

/// The document, under the line that says where in it the person is.
class _Document extends StatelessWidget {
  const _Document({required this.handle, required this.page, required this.hooks});

  final PdfHandle handle;
  final int page;
  final PdfHooks hooks;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        TextStrip(
          icon: Icons.description_outlined,
          text: l10n.pdfPageOf(page, handle.pageCount),
          action: TextButton(onPressed: () => unawaited(_goTo(context)), child: Text(l10n.pdfGoTo)),
        ),
        Expanded(child: handle.view(hooks)),
      ],
    );
  }

  /// Asks for a page, and goes there — only 1 to the last one (S-111).
  Future<void> _goTo(BuildContext context) async {
    final int? target = await showDialog<int>(
      context: context,
      builder: (BuildContext _) => _GoToDialog(pages: handle.pageCount),
    );
    if (target != null) {
      handle.goToPage(target);
    }
  }
}

/// "Go to page": a number from 1 to [pages], said wrong until it is one.
class _GoToDialog extends StatefulWidget {
  const _GoToDialog({required this.pages});

  final int pages;

  @override
  State<_GoToDialog> createState() => _GoToDialogState();
}

class _GoToDialogState extends State<_GoToDialog> {
  final TextEditingController _number = TextEditingController();
  bool _wrong = false;

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  void _submit() {
    final int? page = int.tryParse(_number.text.trim());
    if (page == null || page < 1 || page > widget.pages) {
      setState(() => _wrong = true);
      return;
    }
    Navigator.of(context).pop(page);
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return AlertDialog(
      title: Text(l10n.pdfGoTo),
      content: TextField(
        controller: _number,
        autofocus: true,
        keyboardType: TextInputType.number,
        onSubmitted: (String _) => _submit(),
        decoration: InputDecoration(
          labelText: l10n.pdfPageOf(1, widget.pages),
          errorText: _wrong ? l10n.pdfGoToInvalid(widget.pages) : null,
        ),
      ),
      actions: <Widget>[
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
        ),
        FilledButton(onPressed: _submit, child: Text(l10n.pdfGoTo)),
      ],
    );
  }
}

/// The password, typed hidden — and why the last one did not open it.
class _PasswordSheet extends StatefulWidget {
  const _PasswordSheet({required this.wrong});

  final bool wrong;

  @override
  State<_PasswordSheet> createState() => _PasswordSheetState();
}

class _PasswordSheetState extends State<_PasswordSheet> {
  final TextEditingController _password = TextEditingController();

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  /// What is typed goes back to the viewer — even empty: a document may have an empty password.
  void _submit() => Navigator.of(context).pop(_password.text);

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Padding(
      padding: EdgeInsets.fromLTRB(
        Tokens.spaceMd,
        0,
        Tokens.spaceMd,
        Tokens.spaceMd + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(l10n.pdfPasswordTitle, style: Theme.of(context).textTheme.titleMedium),
          TextField(
            controller: _password,
            autofocus: true,
            obscureText: true,
            enableSuggestions: false,
            autocorrect: false,
            onSubmitted: (String _) => _submit(),
            decoration: InputDecoration(
              labelText: l10n.pdfPasswordField,
              errorText: widget.wrong ? l10n.pdfPasswordWrong : null,
            ),
          ),
          const SizedBox(height: Tokens.spaceSm),
          FilledButton(onPressed: _submit, child: Text(l10n.pdfUnlock)),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
          ),
        ],
      ),
    );
  }
}
