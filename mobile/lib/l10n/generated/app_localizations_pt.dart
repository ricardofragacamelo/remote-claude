// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Portuguese (`pt`).
class AppLocalizationsPt extends AppLocalizations {
  AppLocalizationsPt([String locale = 'pt']) : super(locale);

  @override
  String get appTitle => 'remote-claude';

  @override
  String get commonActionRetry => 'Tentar de novo';

  @override
  String get commonActionSignOut => 'Sair';

  @override
  String get commonErrorUnexpected => 'Algo deu errado do nosso lado.';

  @override
  String get commonErrorOffline => 'Não foi possível falar com o backend.';

  @override
  String get commonErrorInvalidInput => 'A requisição não era válida.';

  @override
  String get commonErrorNotFound => 'Isso não existe.';

  @override
  String get commonErrorForbidden => 'Você não tem permissão para isso.';

  @override
  String get commonErrorPayloadTooLarge => 'Isso é maior do que o servidor aceita.';

  @override
  String get commonErrorRateLimited => 'Requisições demais. Tente de novo em instantes.';

  @override
  String commonErrorTraceLabel(String traceId) {
    return 'Rastreio $traceId';
  }

  @override
  String get authErrorUnauthenticated => 'Entre novamente, por favor.';

  @override
  String get authErrorTokenExpired => 'Sua sessão expirou.';

  @override
  String get authErrorInvalidState => 'A resposta do login não corresponde ao pedido.';

  @override
  String get authSignInTitle => 'Entre para continuar';

  @override
  String get authSignInDescription =>
      'O remote-claude executa o Claude Code na sua própria máquina, por isso pergunta quem é você antes.';

  @override
  String get authSignInAction => 'Entrar';

  @override
  String get authSignInPending => 'Concluindo o login…';

  @override
  String get connectionErrorUnsupportedVersion =>
      'Esta versão fala um protocolo antigo. Atualize o aplicativo.';

  @override
  String get connectionStatusIdle => 'Sem conexão';

  @override
  String get connectionStatusConnecting => 'Conectando…';

  @override
  String get connectionStatusReady => 'Conectado';

  @override
  String get connectionStatusReconnecting => 'Reconectando…';

  @override
  String get connectionStatusClosed => 'Desconectado';

  @override
  String get sessionPingTitle => 'Ida e volta';

  @override
  String get sessionPingDescription =>
      'Um comando por todas as camadas: o gateway, o caso de uso, a regra, o banco e a volta como evento.';

  @override
  String get sessionPingAction => 'Enviar ping';

  @override
  String get sessionPingPending => 'Aguardando o pong…';

  @override
  String get sessionPingEmpty =>
      'Nenhuma ida e volta ainda. Envie uma para ver a cadeia inteira funcionar.';

  @override
  String sessionPingResult(int count, String at) {
    return 'Pong $count às $at';
  }

  @override
  String sessionPingSequence(int seq) {
    return 'Sequência $seq';
  }

  @override
  String sessionPingSessionLabel(String sessionId) {
    return 'Sessão $sessionId';
  }

  @override
  String get sessionErrorNotFound => 'Essa sessão não existe mais.';

  @override
  String sessionErrorInvalidSessionId(String sessionId) {
    return '$sessionId não é um identificador de sessão.';
  }
}
