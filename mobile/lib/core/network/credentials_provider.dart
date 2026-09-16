/// The credential holder, as a provider.
library;

import 'package:remote_claude/core/network/credentials.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'credentials_provider.g.dart';

/// The one credential holder. Kept alive: it is what the transport reads on every call.
@Riverpod(keepAlive: true)
Credentials credentials(Ref ref) => Credentials();
