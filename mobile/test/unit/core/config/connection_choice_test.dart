/// Which origin a choice leads to, and the defaults of a first launch (plan 10, B-28, D-17).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/config/connection_choice.dart';

void main() {
  const DefinedOrigins both = DefinedOrigins(
    internal: 'http://localhost:5173',
    external: 'https://claude.example.dev',
  );

  test('S-97 · none saved: the internal address; only the external one; neither, none', () {
    expect(
      both.resolve(null),
      const ConnectionResolution(origin: 'http://localhost:5173', kind: ConnectionKind.internal),
    );
    expect(
      const DefinedOrigins(external: 'https://claude.example.dev').resolve(null),
      const ConnectionResolution(
        origin: 'https://claude.example.dev',
        kind: ConnectionKind.external,
      ),
    );
    expect(const DefinedOrigins().resolve(null), const ConnectionResolution());
  });

  test('a choice saved leads to its own address', () {
    expect(
      both.resolve(const ConnectionChoice(ConnectionKind.external)),
      const ConnectionResolution(
        origin: 'https://claude.example.dev',
        kind: ConnectionKind.external,
      ),
    );
    expect(
      both.resolve(const ConnectionChoice(ConnectionKind.other, other: 'https://Mine.example/')),
      const ConnectionResolution(origin: 'https://mine.example', kind: ConnectionKind.other),
    );
  });

  test('S-100 · a saved address the build no longer offers: the default, and why', () {
    expect(
      const DefinedOrigins(
        external: 'https://claude.example.dev',
      ).resolve(const ConnectionChoice(ConnectionKind.internal)),
      const ConnectionResolution(
        origin: 'https://claude.example.dev',
        kind: ConnectionKind.external,
        notice: ConnectionNotice.choiceUnavailable,
      ),
    );
    expect(
      both.resolve(const ConnectionChoice(ConnectionKind.other, other: 'http://203.0.113.10')),
      const ConnectionResolution(
        origin: 'http://localhost:5173',
        kind: ConnectionKind.internal,
        notice: ConnectionNotice.choiceUnavailable,
      ),
    );
  });

  test('choices compare by value, the text of the third radio included', () {
    expect(
      const ConnectionChoice(ConnectionKind.other, other: 'x'),
      const ConnectionChoice(ConnectionKind.other, other: 'x'),
    );
    expect(
      const ConnectionChoice(ConnectionKind.internal, other: 'x'),
      isNot(const ConnectionChoice(ConnectionKind.internal)),
    );
  });
}
