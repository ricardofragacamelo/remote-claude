/// Trace identifiers, as a provider.
library;

import 'package:remote_claude/core/network/trace.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'trace_provider.g.dart';

/// The generator of trace identifiers.
@Riverpod(keepAlive: true)
TraceIds traceIds(Ref ref) => TraceIds();
