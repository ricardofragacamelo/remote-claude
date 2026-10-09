/// A diagram engine a test drives (plan 25, B-21).
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:remote_claude/features/files/domain/ports/diagram_engine.dart';

import '../builders/images.dart';

/// Draws every code as one pixel — unless the test said otherwise — and records what it was asked.
class FakeDiagramEngine implements DiagramEngine {
  /// What a code answers instead of the pixel.
  final Map<String, DiagramResult> answers = <String, DiagramResult>{};

  /// Every request, in order.
  final List<DiagramRequest> asked = <DiagramRequest>[];

  /// How many drawings run at once now, and the most that ever did.
  int running = 0;
  int mostAtOnce = 0;

  /// Held open while a test looks at a drawing in flight.
  Completer<void>? gate;

  @override
  Future<DiagramResult> draw(DiagramRequest request) async {
    asked.add(request);
    running += 1;
    mostAtOnce = running > mostAtOnce ? running : mostAtOnce;
    try {
      await gate?.future;
      return answers[request.code] ?? DiagramDrawn(Uint8List.fromList(onePixel));
    } finally {
      running -= 1;
    }
  }
}
