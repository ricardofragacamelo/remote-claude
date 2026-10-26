/// How a rate-limit window's `kind` is said, in words — named in full so the i18n generator sees
/// every key (the same reason `categoryName` in `context_ring.dart` is written this way).
library;

import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The label of [window]: the server's own [RateLimitWindow.displayName] for a per-model window
/// (`"Fable"`, say) — never translated, it is data from the account, not a string this app wrote —
/// or the translated label of a `kind` this build knows, or the raw `kind` itself for one it does
/// not (the same survival rule the backend's own mapper follows for a message variant it does not
/// recognise).
String rateLimitWindowLabel(AppLocalizations l10n, RateLimitWindow window) {
  final String? displayName = window.displayName;
  if (displayName != null) {
    return displayName;
  }

  return switch (window.kind) {
    'five_hour' => l10n.claudeUsageWindowFiveHour,
    'seven_day' => l10n.claudeUsageWindowSevenDay,
    'seven_day_opus' => l10n.claudeUsageWindowSevenDayOpus,
    'seven_day_sonnet' => l10n.claudeUsageWindowSevenDaySonnet,
    'seven_day_overage_included' => l10n.claudeUsageWindowSevenDayOverageIncluded,
    'seven_day_oauth_apps' => l10n.claudeUsageWindowSevenDayOauthApps,
    'overage' => l10n.claudeUsageWindowOverage,
    _ => window.kind,
  };
}

/// The word for [status], in the reader's language.
String rateLimitStatusLabel(AppLocalizations l10n, RateLimitStatus status) => switch (status) {
  RateLimitStatus.allowed => l10n.claudeUsageStatusAllowed,
  RateLimitStatus.allowedWarning => l10n.claudeUsageStatusAllowedWarning,
  RateLimitStatus.rejected => l10n.claudeUsageStatusRejected,
};

/// The order the known windows are shown in — an unknown `kind` sorts after all of these, each
/// after the known ones in a stable, human order.
const List<String> rateLimitWindowOrder = <String>[
  'five_hour',
  'seven_day',
  'seven_day_opus',
  'seven_day_sonnet',
  'overage',
];

/// [windows], in a stable, human order: the known ones first, as the panel of the account lists
/// them.
List<RateLimitWindow> orderedByKind(List<RateLimitWindow> windows) {
  int rank(String kind) {
    final int found = rateLimitWindowOrder.indexOf(kind);
    return found == -1 ? rateLimitWindowOrder.length : found;
  }

  final List<RateLimitWindow> sorted = List<RateLimitWindow>.of(windows);
  sorted.sort((RateLimitWindow a, RateLimitWindow b) {
    final int byRank = rank(a.kind).compareTo(rank(b.kind));
    return byRank != 0 ? byRank : a.kind.compareTo(b.kind);
  });

  return sorted;
}
