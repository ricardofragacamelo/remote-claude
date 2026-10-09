/// The diagrams of a file, drawn one at a time, within ceilings, and kept (plan 25, B-21, R-11).
library;

import 'dart:async';

import 'package:remote_claude/features/files/domain/ports/diagram_engine.dart';

/// The longest code drawn — the `maxTextSize` of Mermaid (S-96).
const int maxDiagramSource = 50000;

/// How long one drawing may take (S-97).
const Duration diagramDeadline = Duration(seconds: 5);

/// The engine behind a queue: the ceiling checked before it, one drawing at a time, each with its
/// deadline, and what was drawn kept by request — scrolling back to a diagram does not draw it
/// again (S-99). A failure that may pass — a deadline, an engine not up — is not kept.
class DiagramQueue {
  DiagramQueue(this._engine, {this.deadline = diagramDeadline});

  final DiagramEngine _engine;
  final Duration deadline;

  final Map<DiagramRequest, DiagramResult> _kept = <DiagramRequest, DiagramResult>{};
  final Map<DiagramRequest, Future<DiagramResult>> _waiting =
      <DiagramRequest, Future<DiagramResult>>{};
  Future<void> _last = Future<void>.value();

  /// How many drawings reached the engine — what a test counts.
  int drawn = 0;

  /// The drawing of [request] — the one already kept, or already on its way, when there is one.
  Future<DiagramResult> draw(DiagramRequest request) {
    final DiagramResult? kept = _kept[request];
    if (kept != null) {
      return Future<DiagramResult>.value(kept);
    }
    if (request.code.length > maxDiagramSource) {
      return Future<DiagramResult>.value(
        DiagramTooLarge(size: request.code.length, limit: maxDiagramSource),
      );
    }
    return _waiting[request] ??= _queued(request);
  }

  Future<DiagramResult> _queued(DiagramRequest request) {
    final Completer<DiagramResult> done = Completer<DiagramResult>();
    _last = _last.then((void _) async {
      drawn += 1;
      final DiagramResult result = await _engine
          .draw(request)
          .timeout(deadline, onTimeout: () => const DiagramTimedOut());
      if (result is DiagramDrawn || result is DiagramInvalid) {
        _kept[request] = result;
      }
      _waiting.removeWhere((DiagramRequest waiting, Future<DiagramResult> _) => waiting == request);
      done.complete(result);
    });
    return done.future;
  }
}
