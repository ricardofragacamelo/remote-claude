/// One origin, and everything the app reaches through it (plan 10, B-28, D-13): the API under `/api`,
/// the socket under `/ws`, and the login under the realm's path. The server's own forwarding is what
/// puts the three behind one address — the same one the web's public mode proves (20 · D-01).
///
/// Pure Dart: validating, normalising and deriving are functions of the text, testable on their own.
library;

import 'package:equatable/equatable.dart';

/// Why a text is not an origin the app may talk to.
enum OriginProblem {
  /// Nothing was written.
  empty,

  /// It is not an address at all.
  notAnAddress,

  /// Its scheme is neither `https` nor `http`.
  scheme,

  /// `http` to a host other than this machine — or, in a debug build, the private network: the
  /// token would travel in clear text (D-14, D-20).
  plainText,

  /// It has a path: the API, the socket and the login sit under paths of their own.
  path,

  /// It has a query.
  query,

  /// It has a fragment.
  fragment,

  /// It carries a user or a password.
  userInfo,
}

/// The hosts `http` is allowed to — the phone's own loopback, through `adb reverse` in the dev and
/// the e2e (D-14).
const Set<String> loopbackHosts = <String>{'localhost', '127.0.0.1'};

/// Whether `http` is allowed to an IPv4 address of the private network too: in every build but the
/// product one. The debug build `pnpm mobile:install` puts on a phone reaches the stack by this
/// machine's address on the local network, where there is no TLS (D-20); the release keeps D-14.
const bool plainTextOnPrivateNetwork = !bool.fromEnvironment('dart.vm.product');

/// An IPv4 octet as written in an address: one to three digits.
final RegExp _octet = RegExp(r'^\d{1,3}$');

/// What checking a text answered.
sealed class OriginCheck extends Equatable {
  const OriginCheck();
}

/// A valid origin, normalised: lower-case scheme and host, the default port dropped, no trailing
/// slash, an IPv6 host in brackets.
final class ValidOrigin extends OriginCheck {
  const ValidOrigin(this.origin);

  final String origin;

  @override
  List<Object?> get props => <Object?>[origin];
}

/// A text that is not one, and why.
final class InvalidOrigin extends OriginCheck {
  const InvalidOrigin(this.problem);

  final OriginProblem problem;

  @override
  List<Object?> get props => <Object?>[problem];
}

/// Checks [raw] as an origin, and normalises it when it is one.
///
/// [privateNetwork] is whether `http` may reach the private network; only tests pass it.
OriginCheck checkOrigin(String raw, {bool privateNetwork = plainTextOnPrivateNetwork}) {
  final String text = raw.trim();

  if (text.isEmpty) {
    return const InvalidOrigin(OriginProblem.empty);
  }

  final Uri? uri = Uri.tryParse(text);

  if (uri == null || !uri.hasScheme || !uri.hasAuthority || uri.host.isEmpty) {
    return const InvalidOrigin(OriginProblem.notAnAddress);
  }

  final OriginProblem? problem = _problemOf(uri, privateNetwork: privateNetwork);

  return problem == null ? ValidOrigin(_normalised(uri)) : InvalidOrigin(problem);
}

/// The first thing wrong with [uri] as an origin, or `null` when nothing is.
OriginProblem? _problemOf(Uri uri, {required bool privateNetwork}) {
  final String scheme = uri.scheme.toLowerCase();

  if (scheme != 'https' && scheme != 'http') {
    return OriginProblem.scheme;
  }

  if (scheme == 'http' && !_plainTextAllowed(uri.host.toLowerCase(), privateNetwork)) {
    return OriginProblem.plainText;
  }

  if (uri.userInfo.isNotEmpty) {
    return OriginProblem.userInfo;
  }

  if (uri.path.isNotEmpty && uri.path != '/') {
    return OriginProblem.path;
  }

  if (uri.hasQuery) {
    return OriginProblem.query;
  }

  return uri.hasFragment ? OriginProblem.fragment : null;
}

/// Whether `http` may reach [host]: this phone always, the private network when [privateNetwork].
bool _plainTextAllowed(String host, bool privateNetwork) =>
    loopbackHosts.contains(host) || (privateNetwork && _isPrivateIpv4(host));

/// Whether [host] is an IPv4 address of a private network — `10/8`, `172.16/12` or `192.168/16`.
///
/// Only a literal address: a name could resolve anywhere, and the point of the exception is an
/// address that exists inside the network alone.
bool _isPrivateIpv4(String host) {
  final List<String> parts = host.split('.');

  if (parts.length != 4 || !parts.every(_octet.hasMatch)) {
    return false;
  }

  final List<int> octets = parts.map(int.parse).toList(growable: false);

  if (octets.any((int octet) => octet > 255)) {
    return false;
  }

  final int first = octets[0];
  final int second = octets[1];

  return first == 10 ||
      (first == 172 && second >= 16 && second <= 31) ||
      (first == 192 && second == 168);
}

/// [uri] as the one spelling of its origin.
String _normalised(Uri uri) {
  final String scheme = uri.scheme.toLowerCase();
  final String host = uri.host.toLowerCase();
  final bool defaultPort =
      (scheme == 'https' && uri.port == 443) || (scheme == 'http' && uri.port == 80);
  final String bracketed = host.contains(':') ? '[$host]' : host;

  return defaultPort ? '$scheme://$bracketed' : '$scheme://$bracketed:${uri.port}';
}

/// Where the app reaches the API, the socket and the login, from one origin.
class ConnectionEndpoints extends Equatable {
  const ConnectionEndpoints({required this.api, required this.socket, required this.issuer});

  /// Everything under [origin]: the API at `/api`, the socket at `/ws` — `wss` for `https`, `ws` for
  /// `http` — and the issuer at [realmPath].
  factory ConnectionEndpoints.of(String origin, String realmPath) {
    final String socketOrigin = origin.startsWith('https://')
        ? 'wss://${origin.substring('https://'.length)}'
        : 'ws://${origin.substring('http://'.length)}';

    return ConnectionEndpoints(
      api: '$origin/api',
      socket: '$socketOrigin/ws',
      issuer: '$origin$realmPath',
    );
  }

  final String api;
  final String socket;
  final String issuer;

  @override
  List<Object?> get props => <Object?>[api, socket, issuer];
}
