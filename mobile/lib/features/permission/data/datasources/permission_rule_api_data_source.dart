/// The rule endpoints of the backend.
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the rule repository needs from the backend.
abstract interface class PermissionRuleApiDataSource {
  /// `GET /permission-rules`. Answers the decoded body.
  Future<Object?> list();

  /// `DELETE /permission-rules/:ruleId`. Answers the decoded body — the rule, revoked.
  Future<Object?> revoke(String ruleId);
}

/// [PermissionRuleApiDataSource] over the one HTTP client.
class HttpPermissionRuleApiDataSource implements PermissionRuleApiDataSource {
  const HttpPermissionRuleApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> list() => _api.get('/permission-rules');

  @override
  Future<Object?> revoke(String ruleId) =>
      _api.delete('/permission-rules/${Uri.encodeComponent(ruleId)}');
}
