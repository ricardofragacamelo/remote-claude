/// The colour of a code block's syntax highlight (plan 26, B-08).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/markdown/highlight_theme.dart';

void main() {
  test('the light and the dark theme each colour the common scopes', () {
    const List<String> commonScopes = <String>['comment', 'string', 'keyword', 'number', 'type'];

    for (final Brightness brightness in Brightness.values) {
      final Map<String, TextStyle> theme = highlightThemeOf(brightness);
      for (final String scope in commonScopes) {
        expect(theme[scope], isNotNull, reason: '$brightness has no colour for $scope');
      }
    }
  });

  test('the dark comment keeps the web\'s own contrast fix (6A9955)', () {
    expect(highlightThemeOf(Brightness.dark)['comment']?.color, const Color(0xFF6A9955));
  });

  test('light and dark disagree on at least the keyword colour', () {
    expect(
      highlightThemeOf(Brightness.light)['keyword']?.color,
      isNot(highlightThemeOf(Brightness.dark)['keyword']?.color),
    );
  });
}
