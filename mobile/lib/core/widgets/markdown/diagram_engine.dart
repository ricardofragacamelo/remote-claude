/// The engine that draws a Mermaid diagram as an image (plan 25, B-21).
///
/// A port, because the engine is native code the `flutter test` does not run — a WebView, by
/// ADR-024. The screens ask for an image and never know what drew it; the tests answer with a fake.
library;

import 'dart:typed_data';

import 'package:equatable/equatable.dart';

/// The two themes of Mermaid the app draws in, after the app's own.
enum DiagramTheme { light, dark }

/// One drawing asked for: the code, the theme, the width it is drawn at, and the density of the
/// screen — the same four always draw the same image, which is what the cache keys on.
class DiagramRequest extends Equatable {
  const DiagramRequest({
    required this.code,
    required this.theme,
    required this.width,
    required this.density,
  });

  final String code;
  final DiagramTheme theme;

  /// In logical pixels.
  final double width;

  /// Physical pixels per logical one: the image is drawn at `width * density`.
  final double density;

  @override
  List<Object?> get props => <Object?>[code, theme, width, density];
}

/// What drawing a diagram ended in.
sealed class DiagramResult {
  const DiagramResult();
}

/// The image, PNG.
final class DiagramDrawn extends DiagramResult {
  const DiagramDrawn(this.png);

  final Uint8List png;
}

/// The code is not a diagram Mermaid reads — with the line, when the engine says it.
final class DiagramInvalid extends DiagramResult {
  const DiagramInvalid({this.line});

  final int? line;
}

/// The code is past the ceiling, and never reached the engine.
final class DiagramTooLarge extends DiagramResult {
  const DiagramTooLarge({required this.size, required this.limit});

  final int size;
  final int limit;
}

/// The engine took longer than the deadline.
final class DiagramTimedOut extends DiagramResult {
  const DiagramTimedOut();
}

/// The engine cannot draw at all — it did not start, or it is busy with a drawing that does not end.
final class DiagramUnavailable extends DiagramResult {
  const DiagramUnavailable();
}

/// Draws one diagram.
abstract interface class DiagramEngine {
  /// Never throws: every way it can fail is a [DiagramResult].
  Future<DiagramResult> draw(DiagramRequest request);
}
