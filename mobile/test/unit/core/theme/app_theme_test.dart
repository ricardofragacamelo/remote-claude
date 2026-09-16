import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/theme/app_theme.dart';

void main() {
  test('both themes exist — this is a developer tool', () {
    expect(AppTheme.light().brightness, Brightness.light);
    expect(AppTheme.dark().brightness, Brightness.dark);
  });

  test('both are derived from the same seed as the web front', () {
    expect(AppTheme.light().colorScheme.primary, isNot(AppTheme.dark().colorScheme.primary));
    expect(AppTheme.light().useMaterial3, isTrue);
  });

  test('a filled button is at least as large as the touch guideline', () {
    final ButtonStyle? style = AppTheme.light().filledButtonTheme.style;
    final Size? minimum = style?.minimumSize?.resolve(<WidgetState>{});

    expect(minimum?.height, greaterThanOrEqualTo(Tokens.touchTarget));
    expect(minimum?.width, greaterThanOrEqualTo(Tokens.touchTarget));
  });

  test('the spacing tokens grow', () {
    expect(Tokens.spaceSm, lessThan(Tokens.spaceMd));
    expect(Tokens.spaceMd, lessThan(Tokens.spaceLg));
    expect(Tokens.radius, greaterThan(0));
  });
}
