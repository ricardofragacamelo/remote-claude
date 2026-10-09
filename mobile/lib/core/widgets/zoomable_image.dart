/// An image from memory, with pinch and drag — the prompt's image and the file viewer's (plan 22,
/// B-33; plan 25, B-17).
///
/// Extracted rather than copied: the duplication gate refuses the second copy, and the two places
/// owe the person the same three states — loading, the image, and why it is not there, with "try
/// again" only when asking again can change the answer.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/core/widgets/refusal_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// [image] while it loads, it — zoomable —, or why it is not shown.
class ZoomableImage extends StatelessWidget {
  const ZoomableImage({
    required this.image,
    required this.semanticLabel,
    required this.loadingLabel,
    super.key,
    this.onRetry,
    this.finalCodes = const <String>{},
  });

  final AsyncValue<Uint8List> image;

  /// What a screen reader says of the image.
  final String semanticLabel;

  /// What is said while it loads.
  final String loadingLabel;

  /// Asks again — offered unless the failure is one of [finalCodes].
  final VoidCallback? onRetry;

  /// The refusals asking again does not change.
  final Set<String> finalCodes;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return switch (image) {
      AsyncValue<Uint8List>(:final Uint8List value, isLoading: false) => InteractiveViewer(
        maxScale: 8,
        child: Center(
          child: Image.memory(
            value,
            semanticLabel: semanticLabel,
            gaplessPlayback: true,
            errorBuilder: (BuildContext context, Object _, StackTrace? _) =>
                _refusal(context, l10n.commonErrorUnexpected, onRetry),
          ),
        ),
      ),
      AsyncValue<Uint8List>(:final Object error, isLoading: false) => _refusal(
        context,
        translateFailure(l10n, asFailure(error)),
        finalCodes.contains(asFailure(error).code) ? null : onRetry,
      ),
      _ => LoadingView(label: loadingLabel),
    };
  }
}

/// Why the image is not shown, and "try again" when that can change it.
Widget _refusal(BuildContext context, String message, VoidCallback? retry) => RefusalView(
  message: message,
  actions: <Widget>[
    if (retry != null)
      TextButton(onPressed: retry, child: Text(AppLocalizations.of(context).commonActionRetry)),
  ],
);
