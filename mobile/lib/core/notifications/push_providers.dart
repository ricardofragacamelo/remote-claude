/// Wiring of the notification transport.
library;

import 'package:remote_claude/core/notifications/platform_push_gateway.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'push_providers.g.dart';

/// The one gateway. Kept alive: a notification arrives whether or not a screen is listening.
@Riverpod(keepAlive: true)
PushGateway pushGateway(Ref ref) => PlatformPushGateway();
