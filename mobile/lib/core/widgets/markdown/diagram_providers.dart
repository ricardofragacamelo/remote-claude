/// Wiring of the diagram engine (plan 25, B-21; moved to `core/` in plan 26, B-07) — the file
/// viewer's markdown and the conversation's both draw a `mermaid` block through the same one.
library;

import 'package:remote_claude/core/widgets/markdown/diagram_engine.dart';
import 'package:remote_claude/core/widgets/markdown/diagram_queue.dart';
import 'package:remote_claude/core/widgets/markdown/webview_diagram_engine.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'diagram_providers.g.dart';

/// The engine of the diagrams — Mermaid in a WebView off screen (ADR-024). One for the app: its
/// start is paid once.
@Riverpod(keepAlive: true)
DiagramEngine diagramEngine(Ref ref) => WebViewDiagramEngine();

/// The diagrams, one at a time, within ceilings, and kept.
@Riverpod(keepAlive: true)
DiagramQueue diagramQueue(Ref ref) => DiagramQueue(ref.watch(diagramEngineProvider));
