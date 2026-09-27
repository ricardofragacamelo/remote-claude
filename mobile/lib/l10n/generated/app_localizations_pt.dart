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

  @override
  String get deviceStatusRegisteringTitle => 'Registrando este aparelho';

  @override
  String get deviceStatusRegisteringBody => 'Avisando o backend de qual aparelho é este.';

  @override
  String get deviceStatusPendingTitle => 'Aguardando aprovação';

  @override
  String get deviceStatusPendingBody =>
      'Você pode acompanhar as sessões daqui. Aprovar uma tool exige este aparelho aprovado antes, e isso é feito pelo navegador na sua máquina.';

  @override
  String get deviceStatusRevokedTitle => 'Este aparelho foi revogado';

  @override
  String get deviceStatusRevokedBody =>
      'Ele não responde mais a pedidos de permissão. Aprove-o de novo pelo navegador na sua máquina, ou saia da conta.';

  @override
  String get deviceStatusUnknownTitle => 'Este aparelho não está registrado';

  @override
  String get deviceStatusUnknownBody =>
      'Você pode acompanhar as sessões. Aprovar uma tool fica desligado até o registro passar.';

  @override
  String get authErrorDeviceNotRegistered => 'Este aparelho ainda não foi aprovado.';

  @override
  String get authErrorDeviceRevoked => 'Este aparelho foi revogado.';

  @override
  String get authErrorDeviceNotFound => 'Esse aparelho não existe.';

  @override
  String get authErrorDeviceApprovalForbidden =>
      'Um aparelho não aprova outro aparelho. Use o navegador.';

  @override
  String get pushDeniedTitle => 'As notificações estão desligadas';

  @override
  String get pushDeniedBody =>
      'Sem notificação, você só vê um pedido de aprovação com este app aberto. Dá para ligar nas configurações do sistema.';

  @override
  String get pushDeniedAction => 'Abrir configurações';

  @override
  String get pushUnavailableTitle => 'Notificações indisponíveis';

  @override
  String get pushUnavailableBody =>
      'Esta versão não recebe notificações. A aprovação funciona com o app aberto, e não há nada para mudar nas configurações do sistema.';

  @override
  String get pushRotationFailedTitle => 'As notificações podem não chegar';

  @override
  String get pushRotationFailedBody =>
      'Este aparelho recebeu um endereço novo de notificação e não foi possível registrá-lo. A aprovação de longe pode não chegar até que seja.';

  @override
  String get workspaceListTitle => 'Pastas';

  @override
  String get workspaceListDescription => 'Escolha uma pasta para abrir uma sessão.';

  @override
  String get workspaceListLoading => 'Carregando as pastas';

  @override
  String get workspaceListEmptyTitle => 'Nenhuma pasta ainda';

  @override
  String get workspaceListEmptyBody =>
      'Não há nada na allowlist. Ela é definida na máquina que roda o backend, não daqui.';

  @override
  String get workspaceNeverOpened => 'Nunca aberta';

  @override
  String get workspaceStartRefused => 'A sessão não foi aberta: este aparelho não está conectado.';

  @override
  String get sessionTitle => 'Sessão';

  @override
  String get sessionEmptyTitle => 'Nada ainda';

  @override
  String get sessionEmptyBody => 'Envie um prompt para começar.';

  @override
  String get sessionPromptHint => 'Peça algo ao Claude';

  @override
  String get sessionPromptAction => 'Enviar';

  @override
  String get sessionPromptRefused => 'Não enviado: este aparelho não está conectado.';

  @override
  String get sessionInterruptAction => 'Parar';

  @override
  String get sessionCloseAction => 'Encerrar sessão';

  @override
  String get sessionStatusStarting => 'Iniciando';

  @override
  String get sessionStatusIdle => 'Ociosa';

  @override
  String get sessionStatusThinking => 'Pensando';

  @override
  String get sessionStatusRunning => 'Executando uma tool';

  @override
  String get sessionStatusWaitingPermission => 'Aguardando aprovação';

  @override
  String get sessionStatusClosed => 'Encerrada';

  @override
  String get sessionToolStatusRunning => 'Executando';

  @override
  String get sessionToolStatusSucceeded => 'Concluída';

  @override
  String get sessionToolStatusFailed => 'Falhou';

  @override
  String get sessionToolStatusDenied => 'Negada';

  @override
  String get sessionToolOutputLabel => 'Saída';

  @override
  String sessionTurnCost(String costUsd, int durationMs) {
    return '$costUsd USD em $durationMs ms';
  }

  @override
  String get sessionClosedByUser => 'Encerrada por quem a abriu.';

  @override
  String get sessionClosedCompleted => 'Terminou sozinha.';

  @override
  String get sessionClosedFailed => 'Encerrada depois de uma falha.';

  @override
  String get sessionClosedAuditUnavailable =>
      'Encerrada porque a trilha de auditoria não pôde ser gravada.';

  @override
  String get sessionClosedShutdown => 'Encerrada porque o backend parou.';

  @override
  String get permissionPageTitle => 'Permissão';

  @override
  String get permissionQueueTitle => 'Esperando por você';

  @override
  String get permissionQueueDescription =>
      'O Claude parou e não vai executar isto até você responder. Silêncio nega.';

  @override
  String permissionCardLabel(String tool) {
    return 'Permissão para $tool';
  }

  @override
  String get permissionToolBash => 'Executar um comando no terminal';

  @override
  String get permissionToolWrite => 'Gravar um arquivo';

  @override
  String get permissionToolEdit => 'Editar um arquivo';

  @override
  String get permissionToolMultiEdit => 'Editar vários arquivos';

  @override
  String get permissionToolNotebookEdit => 'Editar um notebook';

  @override
  String get permissionToolRead => 'Ler um arquivo';

  @override
  String get permissionToolWebFetch => 'Buscar uma página';

  @override
  String permissionToolUnknown(String tool) {
    return 'Usar $tool';
  }

  @override
  String get permissionRiskRead => 'Lê algo';

  @override
  String get permissionRiskWrite => 'Altera um arquivo';

  @override
  String get permissionRiskDestructive => 'Pode destruir algo';

  @override
  String get permissionCommandLabel => 'Exatamente o que vai executar';

  @override
  String permissionRemaining(int seconds) {
    return '$seconds s restantes — depois, é negado';
  }

  @override
  String get permissionScopeOnce => 'Permitir uma vez';

  @override
  String get permissionScopeOnceHint => 'Só este comando, só agora.';

  @override
  String get permissionScopeSession => 'Permitir nesta sessão';

  @override
  String get permissionScopeSessionHint => 'Todo pedido idêntico, até esta sessão terminar.';

  @override
  String get permissionDeny => 'Negar';

  @override
  String get permissionExtend => 'Quero mais tempo';

  @override
  String get permissionExtendExhausted => 'Este pedido não pode mais ser estendido.';

  @override
  String get permissionSending => 'Enviando sua resposta…';

  @override
  String get permissionConfirmTitle => 'Isto pode destruir algo. Permitir mesmo assim?';

  @override
  String get permissionConfirmAction => 'Sim, permitir';

  @override
  String get permissionConfirmCancel => 'Voltar';

  @override
  String get permissionLockReason =>
      'Confirme que é você para permitir este comando no seu computador';

  @override
  String get permissionLockRefused =>
      'Não foi confirmado que este celular é seu. Nada foi enviado.';

  @override
  String get permissionNoLockTitle => 'Este celular não tem bloqueio de tela';

  @override
  String get permissionNoLockBody =>
      'Um celular sem digital, PIN, padrão ou senha não pode aprovar comandos. Configure um bloqueio de tela nas configurações do sistema. Você ainda pode negar e acompanhar.';

  @override
  String get permissionNotSent =>
      'Sua resposta não saiu: a conexão caiu. Tente de novo quando ela voltar.';

  @override
  String get permissionOffline => 'Sem conexão: responder espera ela voltar.';

  @override
  String get permissionConnecting => 'Conectando à sessão antes de você poder responder…';

  @override
  String get permissionDeviceBlocked =>
      'Este celular não pode responder até ser aprovado no navegador.';

  @override
  String get permissionCheckingTitle => 'Conferindo este pedido com o servidor…';

  @override
  String get permissionGoneTitle => 'Este pedido não existe mais';

  @override
  String get permissionGoneBody =>
      'A sessão a que ele pertencia terminou, ou o servidor reiniciou. Não há mais nada a responder.';

  @override
  String get permissionOpenSession => 'Abrir a sessão';

  @override
  String get permissionOutcomeAllowedWeb => 'Permitido no navegador.';

  @override
  String get permissionOutcomeRefusedWeb => 'Negado no navegador.';

  @override
  String get permissionOutcomeAllowedPhone => 'Permitido por um celular.';

  @override
  String get permissionOutcomeRefusedPhone => 'Negado por um celular.';

  @override
  String get permissionOutcomeAllowed => 'Permitido.';

  @override
  String get permissionOutcomeRefused => 'Negado.';

  @override
  String get permissionOutcomeAllowedByRule =>
      'Permitido por uma das suas regras, sem perguntar a ninguém.';

  @override
  String get permissionOutcomeRefusedByRule =>
      'Negado por uma das suas regras, sem perguntar a ninguém.';

  @override
  String get permissionOutcomeExpired => 'Negado automaticamente: ninguém respondeu a tempo.';

  @override
  String get approvalLockTitle => 'Pedir digital ou PIN antes de aprovar';

  @override
  String get approvalLockBody => 'Ligado por padrão. Negar nunca pede.';

  @override
  String get permissionErrorRequestNotFound => 'Esse pedido não está mais aberto.';

  @override
  String get permissionErrorRequestExpired => 'Esse pedido perdeu o prazo.';

  @override
  String get permissionErrorNotOwned => 'Esse pedido não é seu para responder.';

  @override
  String get permissionScopeProject => 'Não perguntar de novo neste projeto';

  @override
  String permissionScopeProjectHint(String duration) {
    return 'Pedidos iguais neste projeto executam sem perguntar, por $duration.';
  }

  @override
  String get permissionScopeAlways => 'Não perguntar de novo em lugar nenhum';

  @override
  String permissionScopeAlwaysHint(String duration) {
    return 'Pedidos iguais em qualquer projeto seu executam sem perguntar, por $duration.';
  }

  @override
  String permissionRuleDays(int days) {
    return '$days dias';
  }

  @override
  String permissionRuleHours(int hours) {
    return '$hours horas';
  }

  @override
  String get permissionPersistTitle => 'Parar de perguntar sobre isto?';

  @override
  String permissionPersistProject(String duration) {
    return 'O Claude vai executar o que casar com a regra abaixo neste projeto sem perguntar a você, por $duration.';
  }

  @override
  String permissionPersistAlways(String duration) {
    return 'O Claude vai executar o que casar com a regra abaixo em qualquer projeto seu sem perguntar a você, por $duration.';
  }

  @override
  String get permissionPersistRevocable =>
      'Você pode retirar isso a qualquer momento nas suas regras. A revogação vale no próximo pedido, em toda sessão aberta.';

  @override
  String get permissionPersistOpenRules => 'Ver suas regras';

  @override
  String get permissionPersistConfirm => 'Permitir e parar de perguntar';

  @override
  String get permissionErrorRuleNotFound => 'Essa regra não existe.';

  @override
  String get rulesTitle => 'Suas regras';

  @override
  String get rulesOpen => 'Regras que você concedeu';

  @override
  String get rulesReload => 'Ler a lista de novo';

  @override
  String get rulesDescription =>
      'O que o Claude pode fazer nesta máquina sem perguntar a você antes. A revogação vale no próximo pedido, em toda sessão aberta.';

  @override
  String get rulesLoading => 'Carregando suas regras…';

  @override
  String get rulesEmptyTitle => 'Nenhuma regra ainda';

  @override
  String get rulesEmptyBody =>
      'Uma regra nasce quando você responde um pedido com “não perguntar de novo”. Até lá, o Claude pergunta toda vez.';

  @override
  String get rulesScopeProject => 'Em um projeto';

  @override
  String get rulesScopeAlways => 'Em todos os projetos';

  @override
  String get rulesDecisionAllow => 'executa sem perguntar';

  @override
  String get rulesDecisionDeny => 'recusado sem perguntar';

  @override
  String get rulesStatusActive => 'Ativa';

  @override
  String get rulesStatusExpired => 'Expirada';

  @override
  String get rulesStatusUnknown => 'Estado desconhecido';

  @override
  String rulesRowLabel(String pattern) {
    return 'Regra $pattern';
  }

  @override
  String rulesToolDecision(String tool, String decision) {
    return '$tool · $decision';
  }

  @override
  String rulesProject(String path) {
    return 'Projeto: $path';
  }

  @override
  String rulesGranted(String who, String at) {
    return 'Concedida por $who em $at';
  }

  @override
  String rulesValidUntil(String at) {
    return 'Válida até $at';
  }

  @override
  String rulesExpiredOn(String at) {
    return 'Expirou em $at. O Claude volta a perguntar.';
  }

  @override
  String rulesExpiringSoon(String at) {
    return 'Expira em breve: depois de $at, o Claude volta a perguntar.';
  }

  @override
  String get rulesRevoke => 'Revogar';

  @override
  String get rulesRevoking => 'Revogando…';

  @override
  String workspaceErrorNotAllowed(String path) {
    return 'Esta instalação não permite $path.';
  }

  @override
  String get workspaceErrorForbidden => 'Essa pasta não é sua para abrir.';

  @override
  String sessionErrorLimitReached(String limit) {
    return 'Esta máquina já está rodando $limit sessões, o máximo que ela permite. Encerre uma e tente de novo.';
  }

  @override
  String get sessionErrorClaudeUnavailable => 'O Claude parou de responder nesta máquina.';

  @override
  String get transcriptErrorNotFound => 'Essa conversa não existe, ou não é sua para ler.';

  @override
  String transcriptErrorInvalidSessionId(String sessionId) {
    return '$sessionId não é um identificador de conversa.';
  }

  @override
  String get transcriptErrorClaudeUnavailable =>
      'O Claude não conseguiu ler o histórico nesta máquina.';

  @override
  String get transcriptErrorClaudeTimeout =>
      'O Claude demorou demais para ler o histórico. Tente de novo.';

  @override
  String get transcriptErrorCursorStale =>
      'Esta conversa mudou enquanto você a lia. Recarregue a partir das mensagens mais recentes.';

  @override
  String workspaceHistoryOpen(String label) {
    return 'Histórico de $label';
  }

  @override
  String get historyListTitle => 'Histórico';

  @override
  String get historyListLoading => 'Carregando conversas';

  @override
  String get historyListEmptyTitle => 'Nenhuma conversa nesta pasta';

  @override
  String get historyListEmptyBody =>
      'Nada foi dito aqui ainda — por este app, pelo editor ou pelo terminal. Abra uma sessão nesta pasta pela lista de pastas para começar uma.';

  @override
  String get historyOriginOurs => 'Aberta por este app';

  @override
  String get historyOriginExternal => 'Começou fora deste app';

  @override
  String historyLastActive(String at) {
    return 'Última atividade $at';
  }

  @override
  String historyBranch(String branch) {
    return 'Branch $branch';
  }

  @override
  String get historyUntitled => 'Conversa sem título';

  @override
  String get historyLoadMore => 'Carregar mais';

  @override
  String get historyLoadingMore => 'Carregando…';

  @override
  String get historyConversationTitle => 'Conversa';

  @override
  String get historyConversationLoading => 'Carregando a conversa';

  @override
  String get historyConversationEmptyTitle => 'Nada foi dito nesta conversa';

  @override
  String get historyConversationEmptyBody =>
      'Ela não tem mensagens para mostrar. Retome-a para dizer algo.';

  @override
  String get historyLoadEarlier => 'Carregar mensagens anteriores';

  @override
  String get historyResumeAction => 'Retomar';

  @override
  String get historyResumePending => 'Retomando…';

  @override
  String get historyResumeOffline =>
      'Retomar precisa da conexão com o backend, e este aparelho não está conectado.';

  @override
  String get historyResumeNotSent =>
      'A conversa não foi retomada: este aparelho não está conectado.';

  @override
  String get historyExternalNote =>
      'Esta conversa começou fora deste app. Retomá-la aqui a continua com um novo id: o editor ou o terminal de onde ela veio não verá as respostas dadas aqui.';

  @override
  String get sessionHistoryLoading => 'Carregando o que foi dito antes';

  @override
  String sessionErrorUnknownCommand(String command) {
    return '$command não é um comando que o Claude oferece nesta máquina.';
  }

  @override
  String get sessionErrorClaudeTimeout =>
      'O Claude demorou demais para responder nesta máquina. Tente de novo.';

  @override
  String get sessionErrorLocked =>
      'A sessão está ocupada: um turno está em execução ou outro desfazer está em andamento. Tente de novo quando ela estiver ociosa.';

  @override
  String get sessionErrorRewindTargetUnknown =>
      'Esse ponto de desfazer não pertence a esta sessão.';

  @override
  String sessionErrorRewindIncomplete(String failed) {
    return 'Alguns arquivos não puderam ser restaurados ($failed). Cada um deles ficou exatamente como estava.';
  }

  @override
  String get sessionCommandsOpen => 'Comandos';

  @override
  String get sessionCommandsTitle => 'Comandos';

  @override
  String get sessionCommandsDescription =>
      'O que o Claude oferece nesta máquina. A caixa de prompt aceita qualquer comando, listado aqui ou não.';

  @override
  String get sessionCommandsSearch => 'Buscar comandos';

  @override
  String get sessionCommandsSuggested => 'Sugeridos';

  @override
  String get sessionCommandsAll => 'Todos os comandos';

  @override
  String get sessionCommandsLoading => 'Carregando os comandos';

  @override
  String get sessionCommandsEmptyTitle => 'Nenhum comando nesta máquina';

  @override
  String get sessionCommandsEmptyBody =>
      'O Claude daqui não oferece comandos. Você ainda pode digitar qualquer coisa na caixa de prompt.';

  @override
  String sessionCommandsNoMatch(String query) {
    return 'Nenhum comando corresponde a “$query”.';
  }

  @override
  String get sessionUndoOpen => 'Desfazer alterações de arquivos';

  @override
  String get sessionUndoTitle => 'Desfazer alterações de arquivos';

  @override
  String get sessionUndoDescription =>
      'Devolva os arquivos que esta sessão escreveu ao estado de antes de um dos turnos dela. Um arquivo alterado fora da sessão fica como está.';

  @override
  String get sessionUndoLoading => 'Carregando os pontos de desfazer';

  @override
  String get sessionUndoEmptyTitle => 'Nada a desfazer ainda';

  @override
  String get sessionUndoEmptyBody =>
      'Cada turno que escreve arquivos vira um ponto ao qual esta sessão pode voltar.';

  @override
  String get sessionUndoUntitled => 'Turno sem título';

  @override
  String sessionUndoPointAt(String date, String time) {
    return '$date às $time';
  }

  @override
  String sessionUndoFileCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count arquivos',
      one: '1 arquivo',
      zero: 'Nenhum arquivo',
    );
    return '$_temp0';
  }

  @override
  String sessionUndoConfirmTitle(String label) {
    return 'Voltar para antes de “$label”';
  }

  @override
  String get sessionUndoGoesBack => 'Volta';

  @override
  String get sessionUndoStays => 'Fica como está';

  @override
  String get sessionUndoAlready => 'Já está como era';

  @override
  String get sessionUndoRestore => 'O conteúdo de antes do turno é restaurado';

  @override
  String get sessionUndoDelete => 'Apagado: este turno o criou';

  @override
  String get sessionUndoReasonModifiedOutside =>
      'Alterado fora da sessão depois que ela o escreveu';

  @override
  String get sessionUndoReasonNotRestorable => 'Grande demais ou ilegível para ter sido guardado';

  @override
  String get sessionUndoReasonUnsafePath =>
      'Deixou de ser um arquivo comum, ou a pasta dele deixou de existir';

  @override
  String get sessionUndoReasonNoBaseline => 'Nada registra como a sessão o deixou';

  @override
  String get sessionUndoReasonOther => 'Mantido por um motivo que este app não conhece';

  @override
  String get sessionUndoNothingToRevert => 'Nada mudaria: nenhum arquivo deste ponto pode voltar.';

  @override
  String get sessionUndoConfirm => 'Desfazer';

  @override
  String get sessionUndoPending => 'Desfazendo…';

  @override
  String get sessionUndoBack => 'Voltar aos pontos de desfazer';

  @override
  String get sessionUndoBusy =>
      'Desfazer só está disponível com a sessão ociosa. Espere o turno terminar.';

  @override
  String get sessionUndoClosed =>
      'Esta sessão está encerrada, então os arquivos dela não podem mais ser desfeitos daqui.';

  @override
  String get sessionUndoOffline =>
      'Desfazer precisa da conexão com o backend, e este aparelho não está conectado.';

  @override
  String get sessionUndoNotSent => 'Nada foi desfeito: este aparelho não está conectado.';

  @override
  String get sessionUndoDoneTitle => 'Desfazer concluído';

  @override
  String get sessionUndoReverted => 'Restaurados';

  @override
  String get sessionUndoRestored => 'Restaurado ao estado de antes do turno';

  @override
  String get sessionUndoDeleted => 'Apagado: o turno o tinha criado';

  @override
  String get sessionUndoFailed => 'Não puderam ser restaurados';
}
