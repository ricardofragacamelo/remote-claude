/// The router, as a provider.
library;

import 'package:go_router/go_router.dart';
import 'package:remote_claude/app/router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'router_provider.g.dart';

/// The one router.
@Riverpod(keepAlive: true)
GoRouter router(Ref ref) => buildRouter(ref);
