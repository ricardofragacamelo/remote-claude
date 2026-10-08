/// A size in bytes, as a person reads it — the web's reading, in the app (plan 22, B-32, B-33).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/byte_size.dart';

void main() {
  test('below a kilobyte, in bytes', () {
    expect(formatBytes(0, 'en'), '0 byte');
    expect(formatBytes(999, 'en'), '999 byte');
  });

  test('from a kilobyte, in kilobytes with at most one decimal', () {
    expect(formatBytes(1000, 'en'), '1 kB');
    expect(formatBytes(48213, 'en'), '48.2 kB');
    expect(formatBytes(999949, 'en'), '999.9 kB');
  });

  test('from a megabyte, in megabytes', () {
    expect(formatBytes(1000000, 'en'), '1 MB');
    expect(formatBytes(2621440, 'en'), '2.6 MB');
    expect(formatBytes(1234567890, 'en'), '1,234.6 MB');
  });

  test('in the locale of the person', () {
    expect(formatBytes(48213, 'pt'), '48,2 kB');
    expect(formatBytes(1234567890, 'pt'), '1.234,6 MB');
  });
}
