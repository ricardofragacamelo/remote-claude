/// The four states every screen that loads data owes the person, in one place.
///
/// Loading, error, empty and content. A missing one is a review failure, because the missing one
/// is always the one somebody eventually sees (docs/architecture/mobile/04-ui.md).
///
/// It is one widget rather than the same four branches written per screen for the reason the web
/// end learned the hard way: written out each time, they drift into four slightly different
/// paddings, three retry buttons and one screen that renders a spinner for ever because its error
/// branch reads `AsyncError` — which a build that fails while the provider is still settling is
/// **not**.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/widgets/empty_view.dart';
import 'package:remote_claude/core/widgets/error_view.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';

/// What each of the three states before the content is called, already translated.
class LoadedLabels {
  const LoadedLabels({
    required this.loading,
    required this.emptyTitle,
    required this.emptyDescription,
  });

  /// What is being waited for.
  final String loading;

  /// What is empty.
  final String emptyTitle;

  /// What the person can do about it being empty.
  final String emptyDescription;
}

/// Renders one [AsyncValue] as the four states.
class LoadedView<T> extends StatelessWidget {
  const LoadedView({
    required this.value,
    required this.labels,
    required this.builder,
    super.key,
    this.onRetry,
    this.isEmpty,
  });

  /// What is being loaded.
  final AsyncValue<T> value;

  final LoadedLabels labels;

  /// What to show once there is something to show.
  final Widget Function(T value) builder;

  /// The recovery action, when there is one to offer.
  final VoidCallback? onRetry;

  /// Whether the loaded value counts as nothing. Without it, nothing is ever empty.
  final bool Function(T value)? isEmpty;

  @override
  Widget build(BuildContext context) {
    // The error comes first, and it is read as a **property** rather than matched as a class: a
    // build that failed while the provider is still settling arrives as an `AsyncLoading` that
    // carries an error, and a switch over the three classes matches the loading case first.
    final Object? failure = value.error;

    if (failure != null) {
      return ErrorView(failure: asFailure(failure), onRetry: onRetry);
    }

    if (!value.hasValue) {
      return LoadingView(label: labels.loading);
    }

    final T loaded = value.value as T;

    if (isEmpty?.call(loaded) ?? false) {
      return EmptyView(title: labels.emptyTitle, description: labels.emptyDescription);
    }

    return builder(loaded);
  }
}
