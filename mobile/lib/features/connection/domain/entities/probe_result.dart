/// What testing an address answered (plan 10, B-29).
library;

/// The answer of a test, each with its own sentence (S-106).
enum ProbeResult {
  /// The server answered, and so did its login.
  ok,

  /// Nothing answered at that address — down, unreachable from this network, or not the server.
  serverUnreachable,

  /// The server answered, and its login did not.
  loginUnavailable,
}
