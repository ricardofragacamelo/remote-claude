/// The preview of a markdown file (plan 25, B-19…B-22).
///
/// Content nobody reviewed (07 · D-18): HTML is text, a link goes through the rule of
/// `followLink`, a remote image is never loaded — its alternative text and address stand in its
/// place —, a relative one comes from the folder with the credential in the header. A wide table
/// and a code block scroll sideways in their own box, never the page (S-83). The preview is a lazy
/// list, so a diagram is drawn when it comes near the view. A pinch scales the text, from half to
/// three times, and the preview reflows to the width of the screen (S-84).
library;

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/files/domain/entities/viewer_kind.dart';
import 'package:remote_claude/features/files/domain/services/resolve_relative_link.dart';
import 'package:remote_claude/features/files/domain/services/viewer_for.dart';
import 'package:remote_claude/features/files/presentation/providers/file_view_controllers.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/markdown_syntaxes.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/mermaid_block.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/no_preview.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/open_link.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/pinch_scale.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// [content] of the file at [path] in [folder], previewed.
class MarkdownViewer extends StatefulWidget {
  const MarkdownViewer({
    required this.folder,
    required this.path,
    required this.content,
    super.key,
    this.sessionId,
  });

  final String folder;
  final String path;
  final String content;
  final String? sessionId;

  @override
  State<MarkdownViewer> createState() => _MarkdownViewerState();
}

class _MarkdownViewerState extends State<MarkdownViewer> {
  double _scale = 1;

  @override
  Widget build(BuildContext context) {
    if (widget.content.trim().isEmpty) {
      return const EmptyFile();
    }

    final MediaQueryData media = MediaQuery.of(context);
    final ThemeData theme = Theme.of(context);

    return PinchScale(
      scale: _scale,
      onScale: (double scale) => setState(() => _scale = scale),
      child: MediaQuery(
        data: media.copyWith(textScaler: TextScaler.linear(media.textScaler.scale(1) * _scale)),
        child: SelectionArea(
          child: Markdown(
            data: widget.content,
            extensionSet: md.ExtensionSet.gitHubFlavored,
            blockSyntaxes: appBlockSyntaxes,
            builders: <String, MarkdownElementBuilder>{mermaidTag: _MermaidBuilder()},
            styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
              tableColumnWidth: const IntrinsicColumnWidth(),
              code: identifierStyle(context),
            ),
            onTapLink: (String text, String? href, String title) => unawaited(
              followLink(
                context,
                folder: widget.folder,
                from: widget.path,
                href: href ?? '',
                sessionId: widget.sessionId,
              ),
            ),
            imageBuilder: (Uri uri, String? title, String? alt) =>
                _image(context, uri.toString(), alt),
          ),
        ),
      ),
    );
  }

  /// An image of the preview: from the folder when relative; a remote one never (S-92).
  Widget _image(BuildContext context, String src, String? alt) {
    final LinkTarget target = resolveLink(widget.path, src);
    final String name = (alt ?? '').isEmpty ? src : '$alt — $src';

    return switch (target) {
      FileLink(:final String path) => _FolderImage(folder: widget.folder, path: path, alt: name),
      _ => _Alternative(text: AppLocalizations.of(context).markdownRemoteImage(name)),
    };
  }
}

/// The builder of a `mermaid` block.
class _MermaidBuilder extends MarkdownElementBuilder {
  @override
  bool isBlockElement() => true;

  @override
  Widget? visitElementAfterWithContext(
    BuildContext context,
    md.Element element,
    TextStyle? preferredStyle,
    TextStyle? parentStyle,
  ) => MermaidBlock(code: element.textContent.trimRight());
}

/// An image of the folder, inline — its alternative text when it is not there (S-91, S-93).
class _FolderImage extends ConsumerWidget {
  const _FolderImage({required this.folder, required this.path, required this.alt});

  final String folder;
  final String path;
  final String alt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final RawBytes? image = watchRawBytes(ref, folder, path).value;

    // Only what the server read as an image, never an SVG — and its words until then (S-93).
    if (image == null || !confirms(ViewerKind.image, image.contentType)) {
      return _Alternative(text: alt);
    }
    return Image.memory(
      image.bytes,
      semanticLabel: alt,
      errorBuilder: (BuildContext _, Object _, StackTrace? _) => _Alternative(text: alt),
    );
  }
}

/// The words in the place of an image.
class _Alternative extends StatelessWidget {
  const _Alternative({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: Theme.of(context).textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
  );
}
