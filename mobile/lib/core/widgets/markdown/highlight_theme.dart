/// The colour of a code block's syntax highlight (plan 26, B-08) — the editor's own theme, like
/// Monaco's `vs`/`remote-claude-dark` the web colours a block with
/// (`web/src/features/editor/lib/monaco-engine.ts`), not the app's Material `ColorScheme`: a code
/// block is content, coloured by the language's grammar, the same on every screen that shows code —
/// never by the surface it sits on.
///
/// `re_highlight` (D-10) emits `highlight.js`'s own scope names (`keyword`, `string`, `comment`…),
/// the same ones Monaco's default themes assign a colour to — so this table is that assignment,
/// read off Monaco's bundled `vs` (light) and `vs-dark` (dark, with the comment the web's own
/// `remote-claude-dark` brightens for contrast) themes, by scope instead of by TextMate rule.
///
/// One row per scope, both colours together — so a scope added to one theme is never forgotten in
/// the other, and `highlightThemeOf` only ever picks a column.
library;

import 'package:flutter/material.dart';

/// One scope's style in each brightness; [light] and [dark] are ARGB.
class _Row {
  const _Row(this.scope, this.light, this.dark, {this.weight, this.style, this.underline = false});

  final String scope;
  final int light;
  final int dark;
  final FontWeight? weight;
  final FontStyle? style;
  final bool underline;

  TextStyle _of(int colour) => TextStyle(
    color: Color(colour),
    fontWeight: weight,
    fontStyle: style,
    decoration: underline ? TextDecoration.underline : null,
  );
}

const List<_Row> _rows = <_Row>[
  _Row('comment', 0xFF008000, 0xFF6A9955),
  _Row('quote', 0xFF008000, 0xFF6A9955),
  _Row('doctag', 0xFF008000, 0xFF6A9955, weight: FontWeight.bold),

  _Row('string', 0xFFA31515, 0xFFCE9178),
  _Row('regexp', 0xFF811F3F, 0xFFD16969),
  _Row('char.escape', 0xFFA31515, 0xFFD7BA7D),
  _Row('subst', 0xFF000000, 0xFFD4D4D4),
  _Row('symbol', 0xFFA31515, 0xFFCE9178),

  _Row('number', 0xFF098658, 0xFFB5CEA8),
  _Row('literal', 0xFF098658, 0xFFB5CEA8),

  _Row('keyword', 0xFF0000FF, 0xFF569CD6),
  _Row('built_in', 0xFF267F99, 0xFF4EC9B0),
  _Row('type', 0xFF267F99, 0xFF4EC9B0),
  _Row('title.class', 0xFF267F99, 0xFF4EC9B0),
  _Row('title.class.inherited', 0xFF267F99, 0xFF4EC9B0),
  _Row('class', 0xFF267F99, 0xFF4EC9B0),
  _Row('variable.language', 0xFF0000FF, 0xFF569CD6),
  _Row('variable.constant', 0xFF0000FF, 0xFF569CD6),

  _Row('title.function', 0xFF795E26, 0xFFDCDCAA),
  _Row('title.function.invoke', 0xFF795E26, 0xFFDCDCAA),
  _Row('function', 0xFF795E26, 0xFFDCDCAA),

  _Row('variable', 0xFF001080, 0xFF9CDCFE),
  _Row('params', 0xFF001080, 0xFF9CDCFE),
  _Row('property', 0xFF001080, 0xFF9CDCFE),
  _Row('attr', 0xFFFF0000, 0xFF9CDCFE),
  _Row('attribute', 0xFFFF0000, 0xFF9CDCFE),

  _Row('name', 0xFF800000, 0xFF569CD6),
  _Row('tag', 0xFF800000, 0xFF569CD6),
  _Row('selector-tag', 0xFF800000, 0xFFD7BA7D),
  _Row('selector-id', 0xFF800000, 0xFFD7BA7D),
  _Row('selector-class', 0xFF800000, 0xFFD7BA7D),
  _Row('selector-attr', 0xFF800000, 0xFF9CDCFE),
  _Row('selector-pseudo', 0xFF800000, 0xFFD7BA7D),
  _Row('template-tag', 0xFF800000, 0xFF569CD6),
  _Row('template-variable', 0xFF0000FF, 0xFF569CD6),

  _Row('meta', 0xFF795E26, 0xFFDCDCAA),
  _Row('meta.prompt', 0xFF267F99, 0xFF4EC9B0),
  _Row('section', 0xFF0000FF, 0xFF569CD6, weight: FontWeight.bold),
  _Row('bullet', 0xFF0000FF, 0xFF569CD6),
  _Row('link', 0xFF0000FF, 0xFF569CD6, underline: true),
  _Row('emphasis', 0xFF000000, 0xFFD4D4D4, style: FontStyle.italic),
  _Row('strong', 0xFF000000, 0xFFD4D4D4, weight: FontWeight.bold),
  _Row('formula', 0xFF000000, 0xFFD4D4D4, style: FontStyle.italic),

  _Row('addition', 0xFF098658, 0xFFB5CEA8),
  _Row('deletion', 0xFFA31515, 0xFFCE9178),
  _Row('punctuation', 0xFF000000, 0xFFD4D4D4),
  _Row('operator', 0xFF000000, 0xFFD4D4D4),
];

final Map<String, TextStyle> _light = <String, TextStyle>{
  for (final _Row row in _rows) row.scope: row._of(row.light),
};

final Map<String, TextStyle> _dark = <String, TextStyle>{
  for (final _Row row in _rows) row.scope: row._of(row.dark),
};

/// The highlight colours for [brightness], keyed by the scope `re_highlight` names a token with.
Map<String, TextStyle> highlightThemeOf(Brightness brightness) =>
    brightness == Brightness.dark ? _dark : _light;
