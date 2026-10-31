import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';
import 'package:remote_claude/engines/claude/usage/presentation/widgets/rate_limit_labels.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../../../../support/pump_app.dart';

RateLimitWindow _window(String kind, {String? displayName}) => RateLimitWindow(
  kind: kind,
  status: RateLimitStatus.allowed,
  utilizationPercent: 0,
  resetsAt: null,
  observedAt: DateTime.utc(2026),
  displayName: displayName,
);

void main() {
  group('rateLimitWindowLabel', () {
    late AppLocalizations l10n;

    setUpAll(() async => l10n = await englishCatalogue());

    test('every known kind has its own translated label', () {
      expect(
        rateLimitWindowLabel(l10n, _window('five_hour')),
        l10n.enginesClaudeUsageWindowFiveHour,
      );
      expect(
        rateLimitWindowLabel(l10n, _window('seven_day')),
        l10n.enginesClaudeUsageWindowSevenDay,
      );
      expect(
        rateLimitWindowLabel(l10n, _window('seven_day_opus')),
        l10n.enginesClaudeUsageWindowSevenDayOpus,
      );
      expect(
        rateLimitWindowLabel(l10n, _window('seven_day_sonnet')),
        l10n.enginesClaudeUsageWindowSevenDaySonnet,
      );
      expect(
        rateLimitWindowLabel(l10n, _window('seven_day_overage_included')),
        l10n.enginesClaudeUsageWindowSevenDayOverageIncluded,
      );
      expect(
        rateLimitWindowLabel(l10n, _window('seven_day_oauth_apps')),
        l10n.enginesClaudeUsageWindowSevenDayOauthApps,
      );
      expect(rateLimitWindowLabel(l10n, _window('overage')), l10n.enginesClaudeUsageWindowOverage);
    });

    test('a kind this build does not know is shown by its own raw name', () {
      expect(rateLimitWindowLabel(l10n, _window('a_future_window')), 'a_future_window');
    });

    test('a per-model window is shown by the server’s own name, never translated', () {
      expect(
        rateLimitWindowLabel(l10n, _window('model_scoped:fable', displayName: 'Fable')),
        'Fable',
      );
    });
  });

  group('rateLimitStatusLabel', () {
    late AppLocalizations l10n;

    setUpAll(() async => l10n = await englishCatalogue());

    test('every status has its own translated word', () {
      expect(
        rateLimitStatusLabel(l10n, RateLimitStatus.allowed),
        l10n.enginesClaudeUsageStatusAllowed,
      );
      expect(
        rateLimitStatusLabel(l10n, RateLimitStatus.allowedWarning),
        l10n.enginesClaudeUsageStatusAllowedWarning,
      );
      expect(
        rateLimitStatusLabel(l10n, RateLimitStatus.rejected),
        l10n.enginesClaudeUsageStatusRejected,
      );
    });
  });

  group('orderedByKind', () {
    test('puts the known windows first, in the order the account panel lists them', () {
      final List<RateLimitWindow> ordered = orderedByKind(<RateLimitWindow>[
        _window('overage'),
        _window('seven_day'),
        _window('model_scoped:fable'),
        _window('five_hour'),
      ]);

      expect(ordered.map((RateLimitWindow w) => w.kind), <String>[
        'five_hour',
        'seven_day',
        'overage',
        'model_scoped:fable',
      ]);
    });

    test('sorts unknown kinds after the known ones, alphabetically among themselves', () {
      final List<RateLimitWindow> ordered = orderedByKind(<RateLimitWindow>[
        _window('zzz_unknown'),
        _window('five_hour'),
        _window('aaa_unknown'),
      ]);

      expect(ordered.map((RateLimitWindow w) => w.kind), <String>[
        'five_hour',
        'aaa_unknown',
        'zzz_unknown',
      ]);
    });
  });
}
