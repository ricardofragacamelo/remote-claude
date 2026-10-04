/// An instant, as a person reads it: the medium date and the time of day, in their locale.
library;

import 'package:flutter/material.dart';

/// [at], in the device's time zone and the app's locale.
String dateAndTime(BuildContext context, DateTime at) {
  final MaterialLocalizations dates = MaterialLocalizations.of(context);
  final DateTime local = at.toLocal();

  return '${dates.formatMediumDate(local)} ${dates.formatTimeOfDay(TimeOfDay.fromDateTime(local))}';
}
