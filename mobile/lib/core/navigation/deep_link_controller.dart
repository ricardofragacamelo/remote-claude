/// Where something outside the widget tree is asking the app to go.
///
/// A notification is tapped while no screen is listening, and the answer to "which screen should
/// be open now" arrives from the platform rather than from a widget. Holding it as state, and
/// letting the app layer act on it, is what keeps the feature that received the tap from
/// importing the router — which would be a cycle between `app/` and `features/`.
library;

import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'deep_link_controller.g.dart';

/// The location something asked the app to open, or `null` when there is nothing pending.
@Riverpod(keepAlive: true)
class DeepLinkController extends _$DeepLinkController {
  @override
  String? build() => null;

  /// Asks for [location] to be opened.
  void request(String location) => state = location;

  /// Forgets the request, once it has been honoured.
  ///
  /// Without it, every rebuild of the listener would navigate again — and a screen that keeps
  /// yanking itself back to a notification's target is worse than one that missed it.
  void acknowledge() => state = null;
}
