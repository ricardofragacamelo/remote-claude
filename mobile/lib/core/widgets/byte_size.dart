/// A size in bytes, as a person reads it: the unit that fits, at most one decimal, in their locale.
///
/// The same reading the web gives — `Intl.NumberFormat` with the short unit, in powers of 1000 —, so
/// both ends say the same size for the same file or image.
library;

import 'package:intl/intl.dart';

/// [bytes], in megabytes or kilobytes from one of them, in bytes below — "48.2 kB", "48,2 kB".
String formatBytes(int bytes, String locale) {
  final ({String unit, int size})? fitting = <({String unit, int size})>[
    (unit: 'MB', size: 1000000),
    (unit: 'kB', size: 1000),
  ].where((({String unit, int size}) each) => bytes >= each.size).firstOrNull;
  final NumberFormat number = NumberFormat('#,##0.#', locale);

  return fitting == null
      ? '${number.format(bytes)} byte'
      : '${number.format(bytes / fitting.size)} ${fitting.unit}';
}
