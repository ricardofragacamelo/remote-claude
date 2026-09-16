/// Material 3, light and dark, from one seed.
///
/// Colour comes from the `ColorScheme`, never from a literal: a literal breaks the dark theme,
/// and a destructive permission card that becomes unreadable in the dark is a real problem, not
/// a cosmetic one. The seed is the web front's, so the two ends look like one product.
/// See docs/architecture/mobile/04-ui.md.
library;

import 'package:flutter/material.dart';

/// Spacing and radius tokens. A widget uses these, never a magic number.
abstract final class Tokens {
  /// Tight spacing: inside a chip, between a label and its value.
  static const double spaceSm = 8;

  /// The default gap between elements of a card.
  static const double spaceMd = 16;

  /// Space between sections of a screen.
  static const double spaceLg = 24;

  /// Corner radius of cards and surfaces.
  static const double radius = 12;

  /// Smallest touch target that meets the accessibility guideline.
  static const double touchTarget = 48;
}

/// Seed the palette is derived from, shared with the web front.
const Color brandSeed = Color(0xFF6750A4);

/// The style of an identifier the user may have to read out or type: a trace, a session id, a
/// sequence number. Monospaced so a character cannot be mistaken for another.
TextStyle? identifierStyle(BuildContext context) =>
    Theme.of(context).textTheme.bodySmall?.copyWith(fontFamily: 'monospace');

/// The themes of the app.
abstract final class AppTheme {
  /// Light theme.
  static ThemeData light() => _themeFor(Brightness.light);

  /// Dark theme. Always present — this is a developer's tool.
  static ThemeData dark() => _themeFor(Brightness.dark);

  static ThemeData _themeFor(Brightness brightness) {
    final ColorScheme scheme = ColorScheme.fromSeed(seedColor: brandSeed, brightness: brightness);

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      cardTheme: CardThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radius)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(Tokens.touchTarget, Tokens.touchTarget),
        ),
      ),
    );
  }
}
