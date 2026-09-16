/// Reads the claims of an ID token, without verifying it.
///
/// Reading is not trusting. The token's signature is verified by the **backend**, which is the
/// party that acts on it; the app only needs `sub` to label its own logs and to know whose
/// session it is holding. Deciding anything security-relevant from these claims would be the
/// mistake this comment exists to prevent.
library;

import 'dart:convert';

/// The `sub` of a JWT, or `null` when the token is not one.
String? subjectOf(String? idToken) {
  final Object? claims = claimsOf(idToken);
  if (claims is! Map<String, Object?>) {
    return null;
  }

  final Object? subject = claims['sub'];
  return subject is String ? subject : null;
}

/// The payload of a JWT as a map, or `null` when it cannot be read.
Object? claimsOf(String? idToken) {
  if (idToken == null) {
    return null;
  }

  final List<String> parts = idToken.split('.');
  if (parts.length != 3) {
    return null;
  }

  try {
    return jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
  } on FormatException {
    return null;
  }
}
