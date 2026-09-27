/// Listening to the session stream for exactly as long as a provider lives.
library;

import 'dart:async';

import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

/// Hands every update of the session stream to [onUpdate] until [ref] is disposed.
///
/// Written once because the cancel is the half that gets forgotten: a subscription that outlives
/// its provider keeps applying updates to a notifier nobody reads, and throws the moment it
/// touches a disposed `ref`.
void listenToUpdates(Ref ref, void Function(SessionUpdate update) onUpdate) {
  final StreamSubscription<SessionUpdate> subscription = ref
      .watch(watchSessionProvider)()
      .listen(onUpdate);

  ref.onDispose(() => unawaited(subscription.cancel()));
}
