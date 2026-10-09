/// A `mermaid` block of a markdown preview, drawn as an image (plan 25, B-22, D-18).
///
/// Asked for when the block is built — which, in the preview's list, is when it comes near the
/// view (S-98) —, one at a time through the queue, and kept. While it draws, a reserved space that
/// says so; drawn, the image fitted to the width, named "diagram"; refused, the code with the
/// reason above it. A tap opens it full screen, drawn again at a higher resolution, with zoom. An
/// image has no links and no selectable text, unlike the web's inline SVG — said in mobile/04.
library;

import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/refusal_view.dart';
import 'package:remote_claude/features/files/domain/ports/diagram_engine.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Widths are drawn in steps of this many logical pixels, so a small change of layout keeps the
/// cached image (S-99).
const double _widthStep = 40;

/// How much sharper the full-screen drawing is than the inline one.
const double _fullScreenDensity = 3;

/// The theme of Mermaid that follows the app's.
DiagramTheme diagramThemeOf(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? DiagramTheme.dark : DiagramTheme.light;

/// One diagram of a preview.
class MermaidBlock extends ConsumerStatefulWidget {
  const MermaidBlock({required this.code, super.key});

  final String code;

  @override
  ConsumerState<MermaidBlock> createState() => _MermaidBlockState();
}

class _MermaidBlockState extends ConsumerState<MermaidBlock> {
  DiagramRequest? _asked;
  DiagramResult? _result;

  void _ask(DiagramRequest request) {
    if (request == _asked) {
      return;
    }
    _asked = request;
    _result = null;
    unawaited(
      ref.read(diagramQueueProvider).draw(request).then((DiagramResult result) {
        if (mounted && _asked == request) {
          setState(() => _result = result);
        }
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double width = (constraints.maxWidth / _widthStep).floorToDouble() * _widthStep;
        final DiagramRequest request = DiagramRequest(
          code: widget.code,
          theme: diagramThemeOf(context),
          width: width < _widthStep ? _widthStep : width,
          density: MediaQuery.devicePixelRatioOf(context),
        );
        // A theme or a width that changed is a new drawing (S-106).
        WidgetsBinding.instance.addPostFrameCallback((Duration _) {
          if (mounted) {
            _ask(request);
          }
        });

        return switch (_result) {
          null => _Drawing(label: l10n.diagramDrawing),
          DiagramDrawn(:final png) => GestureDetector(
            onTap: () => unawaited(_fullScreen(context)),
            child: Semantics(
              label: l10n.diagramLabel,
              image: true,
              button: true,
              excludeSemantics: true,
              child: Image.memory(
                png,
                fit: BoxFit.fitWidth,
                width: constraints.maxWidth,
                // The reserved space stays until the image decodes: the preview does not jump.
                frameBuilder: (BuildContext _, Widget image, int? frame, bool synchronous) =>
                    frame == null && !synchronous ? _Drawing(label: l10n.diagramDrawing) : image,
              ),
            ),
          ),
          DiagramInvalid(:final int? line) => _Code(
            reason: line == null ? l10n.diagramInvalid : l10n.diagramInvalidLine(line),
            code: widget.code,
          ),
          DiagramTooLarge(:final int size, :final int limit) => _Code(
            reason: l10n.diagramTooLarge('$size', '$limit'),
            code: widget.code,
          ),
          DiagramTimedOut() ||
          DiagramUnavailable() => _Code(reason: l10n.diagramUnavailable, code: widget.code),
        };
      },
    );
  }

  /// The diagram full screen, drawn again sharper, with pinch and drag (S-105).
  Future<void> _fullScreen(BuildContext context) => Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (BuildContext _) => _FullScreenDiagram(request: _asked!),
    ),
  );
}

/// The space a diagram takes while it is drawn — announced.
class _Drawing extends StatelessWidget {
  const _Drawing({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    liveRegion: true,
    excludeSemantics: true,
    child: SizedBox(
      height: Tokens.spaceMd * 8,
      child: Center(child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
    ),
  );
}

/// The code of a diagram that was not drawn, with why above it (S-103, S-104).
class _Code extends StatelessWidget {
  const _Code({required this.reason, required this.code});

  final String reason;
  final String code;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: <Widget>[
      RefusalView(message: reason),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Text(code, style: identifierStyle(context)),
      ),
    ],
  );
}

/// One diagram, full screen.
class _FullScreenDiagram extends ConsumerStatefulWidget {
  const _FullScreenDiagram({required this.request});

  final DiagramRequest request;

  @override
  ConsumerState<_FullScreenDiagram> createState() => _FullScreenDiagramState();
}

class _FullScreenDiagramState extends ConsumerState<_FullScreenDiagram> {
  late final Future<DiagramResult> _drawn = ref
      .read(diagramQueueProvider)
      .draw(
        DiagramRequest(
          code: widget.request.code,
          theme: widget.request.theme,
          width: widget.request.width,
          density: ui.clampDouble(widget.request.density * _fullScreenDensity, 1, 8),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.diagramLabel)),
      body: SafeArea(
        child: FutureBuilder<DiagramResult>(
          future: _drawn,
          builder: (BuildContext context, AsyncSnapshot<DiagramResult> drawn) =>
              switch (drawn.data) {
                DiagramDrawn(:final png) => InteractiveViewer(
                  maxScale: 6,
                  child: Center(child: Image.memory(png, semanticLabel: l10n.diagramLabel)),
                ),
                null => _Drawing(label: l10n.diagramDrawing),
                _ => Center(child: Text(l10n.diagramUnavailable)),
              },
        ),
      ),
    );
  }
}
