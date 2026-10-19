/// What a tool said: the end the timeline keeps until the whole output arrives — asked for once,
/// when the card opens (plan 22, B-32) —, then the whole of it. Cut by the server, it says how large
/// it was and marks where it was cut (S-114); not arrived, it keeps the end and says so, with "try
/// again" (S-115). Coloured by role, as the web draws it (plan 26, B-15) — see `ansi_text.dart`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/byte_size.dart';
import 'package:remote_claude/core/widgets/retry_line.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/presentation/widgets/ansi_text.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// [output] with the place of the cut marked by [marker], when the route sent the start and the end
/// only.
String withCut(ToolOutput output, String marker) {
  final int? cutAt = output.cutAt;

  return cutAt == null
      ? output.text
      : '${output.text.substring(0, cutAt)}\n$marker\n${output.text.substring(cutAt)}';
}

/// What a tool said, as far as the card knows.
class ToolOutputView extends StatelessWidget {
  const ToolOutputView({
    required this.tool,
    required this.result,
    required this.onRetry,
    super.key,
  });

  final ToolExecution tool;

  /// The whole output, asked for — `null` while it is not (S-116).
  final AsyncValue<ToolOutput>? result;

  /// Asks for the whole output again, after it did not arrive.
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ToolOutput? whole = result?.value;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ColorScheme colours = Theme.of(context).colorScheme;
    final TextStyle? small = Theme.of(context).textTheme.bodySmall;
    final String? said = whole == null
        ? _endOf(tool)
        : withCut(whole, l10n.sessionToolRowOutputCut);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (said != null && said.isNotEmpty) AnsiText(said, style: identifierStyle(context)),
        if (result?.isLoading ?? false)
          Semantics(
            liveRegion: true,
            child: Text(
              l10n.sessionToolRowOutputLoading,
              style: small?.copyWith(color: colours.onSurfaceVariant),
            ),
          ),
        if (whole != null && whole.truncated)
          Text(
            l10n.sessionToolRowOutputTruncated(
              formatBytes(whole.bytes, Localizations.localeOf(context).toLanguageTag()),
            ),
            style: small?.copyWith(color: colours.onSurfaceVariant),
          ),
        // Asked again, it is loading — not failed — until the answer comes. The end stays above,
        // and this says the whole did not arrive, with "try again".
        if (result case AsyncValue<ToolOutput>(hasError: true, isLoading: false))
          RetryLine(message: l10n.sessionToolRowOutputFailed, onRetry: onRetry),
      ],
    );
  }

  /// What the timeline has of what [tool] said: the end the outcome carried — `null` while it is
  /// still running, which has no output of its own any more, only the elapsed time (plan 26, B-14).
  static String? _endOf(ToolExecution tool) => tool.summary;
}
