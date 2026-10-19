/// The preview of a markdown file (plan 25, B-19…B-22) — drawn by the shared [SafeMarkdown] (plan
/// 26, B-07), with what only a file viewer knows: a relative link opens the viewer at that path, and
/// a relative image comes from the folder, with the credential in the header. A wide table and a
/// code block scroll sideways in their own box, never the page (S-83). The preview is a lazy list,
/// so a diagram is drawn when it comes near the view. A pinch scales the text, from half to three
/// times, and the preview reflows to the width of the screen (S-84).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/widgets/markdown/safe_markdown.dart';
import 'package:remote_claude/features/files/domain/entities/viewer_kind.dart';
import 'package:remote_claude/features/files/domain/services/viewer_for.dart';
import 'package:remote_claude/features/files/presentation/providers/file_view_controllers.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/no_preview.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/pinch_scale.dart';

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

    return PinchScale(
      scale: _scale,
      onScale: (double scale) => setState(() => _scale = scale),
      child: MediaQuery(
        data: media.copyWith(textScaler: TextScaler.linear(media.textScaler.scale(1) * _scale)),
        child: SafeMarkdown(
          data: widget.content,
          from: widget.path,
          onRelativeLink: (String path, {String? anchor, int? line}) => unawaited(
            context.push<void>(viewerRouteFor(widget.folder, path, sessionId: widget.sessionId)),
          ),
          imageResolver: (BuildContext context, String path, String alt) =>
              _FolderImage(folder: widget.folder, path: path, alt: alt),
        ),
      ),
    );
  }
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
      return AlternativeText(text: alt);
    }
    return Image.memory(
      image.bytes,
      semanticLabel: alt,
      errorBuilder: (BuildContext _, Object _, StackTrace? _) => AlternativeText(text: alt),
    );
  }
}
