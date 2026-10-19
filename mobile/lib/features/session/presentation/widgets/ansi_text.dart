/// The colour of a terminal's output — the app's `AnsiText`, paired with the web's
/// (`web/src/features/session/components/conversation/AnsiText.tsx` +
/// `web/src/features/session/lib/ansi.ts`), plan 26, B-15 ([D-19](../../../../../../docs/plans/26-mobile-conversation-parity/decisions.md#f4--card-da-tool-e-linha-do-turno)):
/// the same narrow subset the web draws today — reset, bold on/off, and the foreground of the 16
/// SGR colours collapsed into five theme tokens — never a background, never the 256-colour table,
/// never underline. A hyperlink, a window title, a cursor move and any sequence this build does
/// not know are dropped silently, whole or cut mid-stream: never a byte of them left in the text
/// (S-55), so a copy of what is drawn is a copy of words only (S-56).
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/widgets/scrolling_box.dart';

/// The role a run of text plays, by the theme token it is drawn with — never a literal colour: a
/// role the `ColorScheme` already lends another story elsewhere (`error` for "something broke",
/// `tertiary` for a warning), so the terminal reads like the rest of the app, light or dark.
enum AnsiTone {
  /// SGR 30/90 — a comment, a timestamp: quieter than the surrounding text.
  muted,

  /// SGR 31/91 — a failure.
  danger,

  /// SGR 32/92 — a pass. The `ColorScheme` has no role for it, so it borrows `secondary`, the one
  /// slot nothing else in the app had already claimed.
  success,

  /// SGR 33/93 — a caution, short of a failure.
  warning,

  /// SGR 34/94, 35/95, 36/96 — everything else a terminal colours on purpose.
  accent,
}

/// One run of [text], drawn the same throughout: the tone the terminal gave it, and whether it was
/// bold when it printed.
class AnsiSegment {
  const AnsiSegment(this.text, {this.tone, this.bold = false});

  final String text;
  final AnsiTone? tone;
  final bool bold;
}

/// A CSI ending in `m` (the only kind this build reads), any other complete or end-of-string-cut
/// CSI or OSC, or the two-character escapes a terminal also sends — the same grammar
/// `withoutAnsi` strips, kept here with the SGR sequence's own pieces captured.
final RegExp _escape = RegExp(
  r'\x1B(?:'
  r'\[(?<params>[0-?]*[ -/]*)(?<final>[@-~])'
  r'|\][^\x07\x1B]*(?:\x07|\x1B\\)'
  r'|\][^\x07\x1B]*$'
  r'|\[[0-?]*[ -/]*$'
  r'|[@-Z\\\-_]'
  r'|$'
  r')',
);

/// By the SGR colour code (its 16-colour and bright forms read the same): the tone it sets, or
/// `null` for a code this table does not colour.
const Map<int, AnsiTone> _tones = <int, AnsiTone>{
  30: AnsiTone.muted,
  90: AnsiTone.muted,
  31: AnsiTone.danger,
  91: AnsiTone.danger,
  32: AnsiTone.success,
  92: AnsiTone.success,
  33: AnsiTone.warning,
  93: AnsiTone.warning,
  34: AnsiTone.accent,
  94: AnsiTone.accent,
  35: AnsiTone.accent,
  95: AnsiTone.accent,
  36: AnsiTone.accent,
  96: AnsiTone.accent,
};

/// [text], split where its colour or weight changes: the SGR codes applied in order, a sequence
/// this build does not know left the style as it was (S-55), and `0`/`39`/`22` clearing their part
/// of it rather than the whole run.
List<AnsiSegment> ansiSegments(String text) {
  final List<AnsiSegment> segments = <AnsiSegment>[];
  final StringBuffer run = StringBuffer();
  AnsiTone? tone;
  bool bold = false;
  int cursor = 0;

  void flush() {
    if (run.isNotEmpty) {
      segments.add(AnsiSegment(run.toString(), tone: tone, bold: bold));
      run.clear();
    }
  }

  for (final RegExpMatch match in _escape.allMatches(text)) {
    run.write(text.substring(cursor, match.start));
    cursor = match.end;

    if (match.namedGroup('final') != 'm') {
      continue;
    }

    flush();
    for (final String code in (match.namedGroup('params') ?? '').split(';')) {
      switch (int.tryParse(code) ?? 0) {
        case 0:
          tone = null;
          bold = false;
        case 1:
          bold = true;
        case 22:
          bold = false;
        case 39:
          tone = null;
        case final int sgr when _tones.containsKey(sgr):
          tone = _tones[sgr];
      }
    }
  }

  run.write(text.substring(cursor));
  flush();

  return segments;
}

/// The colour [tone] is drawn with, from the theme — never a literal (app_theme.dart).
Color _colorOf(AnsiTone? tone, ColorScheme colours) => switch (tone) {
  null => colours.onSurface,
  AnsiTone.muted => colours.onSurfaceVariant,
  AnsiTone.danger => colours.error,
  AnsiTone.success => colours.secondary,
  AnsiTone.warning => colours.tertiary,
  AnsiTone.accent => colours.primary,
};

/// The output of a terminal, drawn by role, never as markup (plan 26, B-15). Selectable, so what a
/// copy carries is [text] without its escape sequences (S-56).
class AnsiText extends StatelessWidget {
  const AnsiText(this.text, {super.key, this.style});

  final String text;

  /// The base style each run is drawn over — identifier/monospace, typically.
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colours = Theme.of(context).colorScheme;

    return ScrollingBox(
      child: SelectableText.rich(
        TextSpan(
          children: <InlineSpan>[
            for (final AnsiSegment segment in ansiSegments(text))
              TextSpan(
                text: segment.text,
                // `copyWith(fontWeight: null)` keeps the base's own weight rather than clearing it
                // (Flutter's own `??` semantics) — the off case needs a weight of its own, explicit,
                // so a bold base style cannot leak into a run the terminal turned bold off for.
                style: (style ?? const TextStyle()).copyWith(
                  color: _colorOf(segment.tone, colours),
                  fontWeight: segment.bold ? FontWeight.bold : FontWeight.normal,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
