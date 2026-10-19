/// The diff of a `file.edit` or `file.write` call, read from the backend's own route rather than
/// computed from the call's input — the app's pair of the web's `ToolDiffView` (plan 26, B-16).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/retry_line.dart';
import 'package:remote_claude/features/session/domain/entities/tool_diff.dart';
import 'package:remote_claude/features/session/presentation/providers/tool_diff_controllers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// How many lines a finished call's diff shows before "show all" — the web's own
/// `INLINE_DIFF_LINES`. A new file (`file.write`) folds at the same ceiling (S-59): no larger limit
/// for it.
const int diffFoldLines = 12;

/// Codes that mean there is structurally nothing to diff, not that the read failed: retrying would
/// answer the same thing, so the box says why instead of offering to try again (S-60).
const Set<String> _noDiffCodes = <String>{'DIFF_NOT_APPLICABLE', 'FILE_NOT_TEXT'};

/// The colours a line's background is drawn with, by brightness — content, not a surface, so it
/// keeps its own palette rather than the `ColorScheme`'s (the same reasoning as
/// `highlight_theme.dart`), approximating the web's `--diff-added`/`--diff-removed` tokens.
class _DiffColours {
  const _DiffColours(this.added, this.removed);

  final Color added;
  final Color removed;
}

const _DiffColours _light = _DiffColours(Color(0xFFDCF3E0), Color(0xFFFBE1DE));
const _DiffColours _dark = _DiffColours(Color(0xFF1E3626), Color(0xFF3B241F));

_DiffColours _diffColoursOf(Brightness brightness) =>
    brightness == Brightness.dark ? _dark : _light;

/// The diff of one file-writing call of [sessionId], read once when the card opens.
class ToolDiffView extends ConsumerStatefulWidget {
  const ToolDiffView({required this.sessionId, required this.toolUseId, super.key});

  final String sessionId;
  final String toolUseId;

  @override
  ConsumerState<ToolDiffView> createState() => _ToolDiffViewState();
}

class _ToolDiffViewState extends ConsumerState<ToolDiffView> {
  /// Revealed past the fold by its own "show all" — local, like a card's own fold (S-59).
  bool _unfolded = false;

  @override
  Widget build(BuildContext context) {
    final AsyncValue<ToolDiff> result = ref.watch(
      toolDiffControllerProvider(widget.sessionId, widget.toolUseId),
    );
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextStyle? small = Theme.of(context).textTheme.bodySmall;

    return result.when(
      loading: () => Text(l10n.sessionDiffLoading, style: small),
      error: (Object error, StackTrace _) => _DiffError(
        failure: asFailure(error),
        onRetry: () => ref
            .read(toolDiffControllerProvider(widget.sessionId, widget.toolUseId).notifier)
            .retry(),
      ),
      data: (ToolDiff diff) => diff.hunks.isEmpty
          ? Text(l10n.sessionDiffUnchanged, style: small)
          : _Hunks(
              diff: diff,
              unfolded: _unfolded,
              onUnfold: () => setState(() => _unfolded = true),
            ),
    );
  }
}

/// The diff did not answer: structurally ("`DIFF_NOT_APPLICABLE`"/"`FILE_NOT_TEXT`", no retry — the
/// next read says the same thing — S-60) or in a way asking again might fix (with "try again").
class _DiffError extends StatelessWidget {
  const _DiffError({required this.failure, required this.onRetry});

  final Failure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final bool structural = _noDiffCodes.contains(failure.code);

    return RetryLine(
      message: failureText(context, failure),
      emphasis: !structural,
      onRetry: structural ? null : onRetry,
    );
  }
}

/// [diff]'s hunks, folded past [diffFoldLines] until asked to show every one of them.
class _Hunks extends StatelessWidget {
  const _Hunks({required this.diff, required this.unfolded, required this.onUnfold});

  final ToolDiff diff;
  final bool unfolded;
  final VoidCallback onUnfold;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final int total = diff.lineCount;
    final bool folded = !unfolded && total > diffFoldLines;
    final List<DiffLine> lines = _flatten(diff, folded ? diffFoldLines : total);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(
          container: true,
          label: l10n.sessionDiffLabel(diff.path),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DecoratedBox(
              decoration: BoxDecoration(
                border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                borderRadius: BorderRadius.circular(Tokens.radius),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: Tokens.spaceSm),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[for (final DiffLine line in lines) _LineRow(line: line)],
                ),
              ),
            ),
          ),
        ),
        if (folded) TextButton(onPressed: onUnfold, child: Text(l10n.diffHunksShowAll(total))),
      ],
    );
  }

  /// The first [budget] lines of every hunk, in order — a fold that cuts across a hunk rather than
  /// hiding one whole, the same ceiling that would fold a huge new file (S-59).
  static List<DiffLine> _flatten(ToolDiff diff, int budget) {
    final List<DiffLine> lines = <DiffLine>[for (final DiffHunk hunk in diff.hunks) ...hunk.lines];

    return lines.length <= budget ? lines : lines.sublist(0, budget);
  }
}

/// One line of a hunk: its two gutters (old, new — blank on the side it does not belong to), its
/// sign, and its text, tinted by role.
class _LineRow extends StatelessWidget {
  const _LineRow({required this.line});

  final DiffLine line;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colours = Theme.of(context).colorScheme;
    final _DiffColours diffColours = _diffColoursOf(Theme.of(context).brightness);
    final Color? background = switch (line.kind) {
      DiffLineKind.added => diffColours.added,
      DiffLineKind.removed => diffColours.removed,
      DiffLineKind.context => null,
    };
    final String sign = switch (line.kind) {
      DiffLineKind.added => '+',
      DiffLineKind.removed => '-',
      DiffLineKind.context => ' ',
    };
    final TextStyle style = (identifierStyle(context) ?? const TextStyle()).copyWith(
      color: line.kind == DiffLineKind.context ? colours.onSurfaceVariant : colours.onSurface,
    );

    return ColoredBox(
      color: background ?? Colors.transparent,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceSm),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _Gutter(line.oldLine, style: style),
            _Gutter(line.newLine, style: style),
            SizedBox(
              width: Tokens.spaceSm,
              child: Text(sign, style: style),
            ),
            Text(line.text, style: style),
          ],
        ),
      ),
    );
  }
}

/// One line-number column of a diff — a fixed width, blank on the side a line is not on.
class _Gutter extends StatelessWidget {
  const _Gutter(this.number, {required this.style});

  final int? number;
  final TextStyle style;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: Tokens.touchTarget / 2,
    child: Text(number?.toString() ?? '', style: style, textAlign: TextAlign.right),
  );
}
