/// What a build is compiled with, for a test that mounts the whole app.
library;

import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/connection_choice.dart';

/// A build with an internal address and no external one, unless a test says otherwise.
BuildConfig aBuildConfig({String? internal = 'http://localhost:5173', String? external}) =>
    BuildConfig(
      origins: DefinedOrigins(internal: internal, external: external),
      realmPath: '/realms/remote-claude',
      oidcClientId: 'remote-claude-mobile',
      oidcScopes: 'openid profile email offline_access',
      oidcRedirectUrl: 'com.remoteclaude://callback',
      appVersion: '0.0.1',
    );
