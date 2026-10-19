/// `ansiSegments` — the terminal's colour and weight, read off its own SGR codes (plan 26, B-15).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/presentation/widgets/ansi_text.dart';

void main() {
  group('S-54 · the sixteen colours fold into five tones, bold on top', () {
    test('plain text is one segment, with neither', () {
      final List<AnsiSegment> segments = ansiSegments('hello');

      expect(segments, hasLength(1));
      expect(segments.single.text, 'hello');
      expect(segments.single.tone, isNull);
      expect(segments.single.bold, isFalse);
    });

    test('each SGR colour, normal and bright, is the same tone', () {
      const Map<String, AnsiTone> byCode = <String, AnsiTone>{
        '30': AnsiTone.muted,
        '90': AnsiTone.muted,
        '31': AnsiTone.danger,
        '91': AnsiTone.danger,
        '32': AnsiTone.success,
        '92': AnsiTone.success,
        '33': AnsiTone.warning,
        '93': AnsiTone.warning,
        '34': AnsiTone.accent,
        '94': AnsiTone.accent,
        '35': AnsiTone.accent,
        '95': AnsiTone.accent,
        '36': AnsiTone.accent,
        '96': AnsiTone.accent,
      };

      for (final MapEntry<String, AnsiTone> entry in byCode.entries) {
        final List<AnsiSegment> segments = ansiSegments('\x1B[${entry.key}mword');

        expect(segments.single.tone, entry.value, reason: entry.key);
      }
    });

    test('bold on, then off, then on again with a colour set in the same sequence', () {
      final List<AnsiSegment> segments = ansiSegments('\x1B[1ma\x1B[22mb\x1B[1;34mc');

      expect(segments.map((AnsiSegment s) => (s.text, s.tone, s.bold)), <(String, AnsiTone?, bool)>[
        ('a', null, true),
        ('b', null, false),
        ('c', AnsiTone.accent, true),
      ]);
    });

    test('0 and 39 clear the colour; 0 clears the weight too', () {
      expect(ansiSegments('\x1B[31m\x1B[39mplain').single.tone, isNull);
      expect(ansiSegments('\x1B[1;31m\x1B[0mplain').single.bold, isFalse);
      expect(ansiSegments('\x1B[1;31m\x1B[0mplain').single.tone, isNull);
    });

    test('a reset mid-sequence still applies what follows it, from the reset', () {
      final AnsiSegment segment = ansiSegments('\x1B[1;0;32mword').single;

      expect(segment.bold, isFalse);
      expect(segment.tone, AnsiTone.success);
    });
  });

  group('S-55 · an unknown or mid-cut sequence is dropped, never a byte of it left', () {
    test('256-colour and background codes are ignored — the style before them holds', () {
      final AnsiSegment segment = ansiSegments('\x1B[31m\x1B[48;5;200mstill red').single;

      expect(segment.tone, AnsiTone.danger);
      expect(segment.text, 'still red');
    });

    test('a hyperlink (OSC 8) and a window title (OSC 0) leave only the words', () {
      expect(
        ansiSegments('\x1B]8;;https://x\x07click\x1B]8;;\x07 here').map((AnsiSegment s) => s.text),
        <String>['click here'],
      );
      expect(ansiSegments('\x1B]0;a title\x07done').single.text, 'done');
    });

    test('a cursor move and an unknown two-character escape vanish without a trace', () {
      expect(ansiSegments('a\x1B[2Kb\x1BMc').single.text, 'abc');
    });

    test('a sequence cut at the end of the string — no final byte, no terminator — is dropped', () {
      expect(ansiSegments('word\x1B[31').single.text, 'word');
      expect(ansiSegments('word\x1B]0;untermin').single.text, 'word');
      expect(ansiSegments('word\x1B').single.text, 'word');
    });

    test('empty input is no segments at all', () {
      expect(ansiSegments(''), isEmpty);
    });
  });
}
