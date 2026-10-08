/// The image a prompt carried, as a **marker** — "Attached image", its type and its size — in the
/// place of an empty bubble, a prompt of only an image too (plan 22, B-33, S-118, S-121).
///
/// The bytes never travel with the conversation (D-09): opening it fetches them, with the credential
/// in the header (S-122), and shows them from memory on a screen of their own, which lets them go
/// when it closes (S-119). A refusal of the route — the type, the size, the absence — is said in
/// words in the place of the image, and only what trying again can change offers it (S-120).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/byte_size.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/presentation/providers/transcript_content_controllers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The refusals of the route that asking again does not change: the type, the size, the absence.
const Set<String> _final = <String>{'UNSUPPORTED_MEDIA_TYPE', 'PAYLOAD_TOO_LARGE', 'NOT_FOUND'};

/// What the marker of [image] says: "Attached image", with its type and size when the prompt said.
String imageLabel(AppLocalizations l10n, PromptImage image, String locale) {
  final String? subtype = image.mediaType?.split('/').elementAtOrNull(1);
  final List<String> details = <String>[
    if (subtype != null && subtype.isNotEmpty) subtype.toUpperCase(),
    if (image.size case final int size) formatBytes(size, locale),
  ];

  return details.isEmpty
      ? l10n.sessionImageAttached
      : l10n.sessionImageAttachedWith(details.join(', '));
}

/// One image of a prompt, marked.
class ImageMarker extends StatelessWidget {
  const ImageMarker({required this.image, super.key, this.conversationId});

  final PromptImage image;

  /// The conversation the image is read from — `null` while nothing said which. Without it, or
  /// without the block's identity (a server older than it), the marker is all there is.
  final String? conversationId;

  @override
  Widget build(BuildContext context) {
    final String? conversationId = this.conversationId;
    final String? blockId = image.blockId;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String label = imageLabel(l10n, image, Localizations.localeOf(context).toLanguageTag());

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: Tokens.spaceSm,
      children: <Widget>[
        Icon(
          Icons.image_outlined,
          size: Tokens.spaceMd,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
        Text(label, style: Theme.of(context).textTheme.bodyMedium),
        if (conversationId != null && blockId != null)
          TextButton(
            onPressed: () => showDialog<void>(
              context: context,
              builder: (BuildContext _) =>
                  PromptImageScreen(conversationId: conversationId, blockId: blockId, title: label),
            ),
            child: Text(l10n.sessionImageOpen),
          ),
      ],
    );
  }
}

/// The image, on a screen of its own: it while it loads, it, or why it cannot be shown.
class PromptImageScreen extends ConsumerWidget {
  const PromptImageScreen({
    required this.conversationId,
    required this.blockId,
    required this.title,
    super.key,
  });

  final String conversationId;
  final String blockId;

  /// What the marker said of it.
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<PromptImageBytes> image = ref.watch(
      promptImageControllerProvider(conversationId, blockId),
    );

    return Dialog.fullscreen(
      child: Scaffold(
        appBar: AppBar(
          title: Text(title),
          leading: IconButton(
            icon: const Icon(Icons.close),
            tooltip: l10n.sessionImageClose,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
        body: SafeArea(
          child: Column(
            children: <Widget>[
              ListTile(title: Text(l10n.sessionImageDescription)),
              Expanded(
                child: switch (image) {
                  AsyncValue<PromptImageBytes>(:final PromptImageBytes value, isLoading: false) =>
                    InteractiveViewer(
                      child: Center(
                        child: Image.memory(
                          value.bytes,
                          semanticLabel: l10n.sessionImageAlt,
                          gaplessPlayback: true,
                          errorBuilder: (BuildContext context, Object _, StackTrace? _) =>
                              _Refusal(message: l10n.commonErrorUnexpected),
                        ),
                      ),
                    ),
                  AsyncValue<PromptImageBytes>(:final Object error, isLoading: false) => _Refusal(
                    message: translateFailure(l10n, asFailure(error)),
                    onRetry: _final.contains(asFailure(error).code)
                        ? null
                        : () => ref
                              .read(promptImageControllerProvider(conversationId, blockId).notifier)
                              .retry(),
                  ),
                  _ => LoadingView(label: l10n.sessionImageLoading),
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Why the image is not shown, in words — and "try again" when that can change it.
class _Refusal extends StatelessWidget {
  const _Refusal({required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final VoidCallback? retry = onRetry;

    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.all(Tokens.spaceMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              message,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.error),
            ),
            if (retry != null)
              TextButton(
                onPressed: retry,
                child: Text(AppLocalizations.of(context).commonActionRetry),
              ),
          ],
        ),
      ),
    );
  }
}
