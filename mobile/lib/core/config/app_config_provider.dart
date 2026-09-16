/// The build's configuration, as a provider.
///
/// Declared next to the thing it provides, not in a central DI file: a provider that lives with
/// its subject moves with it, and nothing has to be kept in step by hand.
library;

import 'package:remote_claude/core/config/app_config.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'app_config_provider.g.dart';

/// The configuration.
///
/// Overridden at boot with the values read from `--dart-define`. It throws by default on
/// purpose: an app running with configuration nobody supplied is the failure this is meant to
/// prevent, and a silent default would hide it.
@Riverpod(keepAlive: true)
AppConfig appConfig(Ref ref) => throw StateError('appConfigProvider must be overridden at boot');
