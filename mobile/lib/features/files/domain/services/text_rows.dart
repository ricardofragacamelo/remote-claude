/// The rows a text is drawn in (plan 25, B-15, D-25).
///
/// One row per line, so only the rows near the view are built (S-57). A line that alone weighs —
/// a minified bundle, a JSON on one line — would still be one `Text` of hundreds of kilobytes, so
/// with the wrap on it is drawn in pieces, the number on the first; with it off, its first
/// [cutAt] characters, and a mark that says how many are left (S-58).
library;

import 'package:equatable/equatable.dart';

/// The longest piece a wrapped line is drawn in.
const int pieceLength = 1000;

/// Where a line is cut with the wrap off — the `editor.stopRenderingLineAfter` of VS Code.
const int cutAt = 10000;

/// One row of the viewer.
class TextRow extends Equatable {
  const TextRow({required this.text, this.number, this.cut = 0});

  /// The number of the line — `null` on a piece that continues the line above.
  final int? number;

  final String text;

  /// How many characters of the line were left out of this row.
  final int cut;

  @override
  List<Object?> get props => <Object?>[number, text, cut];
}

final RegExp _lineBreak = RegExp(r'\r\n|\r|\n');

/// The rows of [content]. An empty text has none; a text ending in a line break does not get an
/// empty last line for it.
List<TextRow> textRows(String content, {required bool wrap}) {
  if (content.isEmpty) {
    return const <TextRow>[];
  }

  final List<String> lines = content.split(_lineBreak);
  if (lines.length > 1 && lines.last.isEmpty) {
    lines.removeLast();
  }

  final List<TextRow> rows = <TextRow>[];
  for (int index = 0; index < lines.length; index++) {
    _rowsOfLine(rows, lines[index], index + 1, wrap: wrap);
  }
  return rows;
}

void _rowsOfLine(List<TextRow> rows, String line, int number, {required bool wrap}) {
  if (!wrap) {
    rows.add(
      line.length > cutAt
          ? TextRow(number: number, text: line.substring(0, cutAt), cut: line.length - cutAt)
          : TextRow(number: number, text: line),
    );
    return;
  }

  if (line.length <= pieceLength) {
    rows.add(TextRow(number: number, text: line));
    return;
  }

  for (int start = 0; start < line.length; start += pieceLength) {
    final int end = start + pieceLength < line.length ? start + pieceLength : line.length;
    rows.add(TextRow(number: start == 0 ? number : null, text: line.substring(start, end)));
  }
}

/// The longest row of [rows], in characters — what the width of an unwrapped text is measured by.
int longestRow(List<TextRow> rows) => rows.fold<int>(
  0,
  (int longest, TextRow row) => row.text.length > longest ? row.text.length : longest,
);
