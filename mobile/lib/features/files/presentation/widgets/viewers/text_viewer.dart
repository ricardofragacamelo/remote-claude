/// A text file, as the phone reads it (plan 25, B-15, B-16).
///
/// Monospaced, numbered, one row per line and only the rows near the view built — a single `Text`
/// of the whole file freezes a phone (S-57). The wrap is the person's, for every file; off, the
/// text scrolls both ways. A pinch changes the size of the letters and the rows reflow, which keeps
/// both the virtualization and the wrap (D-07); the size holds while the viewer is open.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/files/domain/services/text_rows.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/no_preview.dart';
import 'package:remote_claude/features/files/presentation/widgets/viewers/pinch_scale.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// [content], in rows.
class TextViewer extends StatefulWidget {
  const TextViewer({required this.content, required this.wrap, super.key});

  final String content;

  /// Long lines wrap at the edge of the screen.
  final bool wrap;

  @override
  State<TextViewer> createState() => _TextViewerState();
}

class _TextViewerState extends State<TextViewer> {
  late List<TextRow> _rows = textRows(widget.content, wrap: widget.wrap);
  double _scale = 1;

  /// Kept across a new version of the file, so the reader stays where they were (S-75).
  final ScrollController _vertical = ScrollController();

  @override
  void didUpdateWidget(TextViewer old) {
    super.didUpdateWidget(old);
    if (old.content != widget.content || old.wrap != widget.wrap) {
      _rows = textRows(widget.content, wrap: widget.wrap);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_rows.isEmpty) {
      return const EmptyFile();
    }
    final AppLocalizations l10n = AppLocalizations.of(context);

    final MediaQueryData media = MediaQuery.of(context);
    final TextScaler scaler = TextScaler.linear(media.textScaler.scale(1) * _scale);
    final TextStyle style = identifierStyle(context) ?? const TextStyle(fontFamily: 'monospace');
    final int digits = '${_rows.lastWhere((TextRow row) => row.number != null).number}'.length;
    final double gutter = _measure('0' * (digits + 1), style, scaler);

    Widget list = ListView.builder(
      controller: _vertical,
      itemCount: _rows.length,
      itemBuilder: (BuildContext context, int index) =>
          _Row(row: _rows[index], gutter: gutter, wrap: widget.wrap, style: style),
    );

    if (!widget.wrap) {
      final double width =
          gutter + _measure('0' * (longestRow(_rows) + 1), style, scaler) + Tokens.spaceMd * 2;
      list = SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: SizedBox(width: width + _cutMarkWidth(l10n, style, scaler), child: list),
      );
    }

    return PinchScale(
      scale: _scale,
      onScale: (double scale) => setState(() => _scale = scale),
      child: MediaQuery(
        data: media.copyWith(textScaler: scaler),
        child: SelectionArea(child: list),
      ),
    );
  }

  @override
  void dispose() {
    _vertical.dispose();
    super.dispose();
  }

  /// Room for the mark of a cut line, when some line was cut.
  double _cutMarkWidth(AppLocalizations l10n, TextStyle style, TextScaler scaler) {
    final int cut = _rows.fold<int>(0, (int most, TextRow row) => row.cut > most ? row.cut : most);
    return cut == 0 ? 0 : _measure(' ${l10n.fileViewerLineCut('$cut')}', style, scaler);
  }

  double _measure(String text, TextStyle style, TextScaler scaler) {
    final TextPainter painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      textScaler: scaler,
      maxLines: 1,
    )..layout();
    final double width = painter.width;
    painter.dispose();
    return width;
  }
}

/// One row: the number of its line (or nothing, on a piece that continues it), and its text.
class _Row extends StatelessWidget {
  const _Row({required this.row, required this.gutter, required this.wrap, required this.style});

  final TextRow row;
  final double gutter;
  final bool wrap;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final Widget text = Text.rich(
      TextSpan(
        text: row.text,
        children: <InlineSpan>[
          if (row.cut > 0)
            TextSpan(
              text: ' ${AppLocalizations.of(context).fileViewerLineCut('${row.cut}')}',
              style: style.copyWith(color: scheme.onSurfaceVariant, fontStyle: FontStyle.italic),
            ),
        ],
      ),
      style: style,
      softWrap: wrap,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceSm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: gutter,
            child: Text(
              row.number == null ? '' : '${row.number}',
              textAlign: TextAlign.right,
              style: style.copyWith(color: scheme.onSurfaceVariant),
              semanticsLabel: '',
            ),
          ),
          const SizedBox(width: Tokens.spaceSm),
          if (wrap) Expanded(child: text) else text,
        ],
      ),
    );
  }
}
