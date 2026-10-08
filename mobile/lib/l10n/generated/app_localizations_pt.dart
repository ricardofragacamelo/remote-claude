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
  String get connectionStatusThrottled =>
      'Enviado rápido demais — aguardando o tempo que o servidor pediu';

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
  String get workspaceListLoading => 'Carregando as pastas';

  @override
  String get workspaceListEmptyTitle => 'Nenhuma pasta ainda';

  @override
  String get workspaceListEmptyBody =>
      'Não há nada na allowlist. Ela é definida na máquina que roda o backend, não daqui.';

  @override
  String get sessionTitle => 'Sessão';

  @override
  String get sessionEmptyTitle => 'Nada ainda';

  @override
  String get sessionEmptyBody => 'Envie um prompt para começar.';

  @override
  String get sessionPromptAction => 'Enviar';

  @override
  String get sessionPromptRefused => 'Não enviado: este aparelho não está conectado.';

  @override
  String get sessionToolStatusRunning => 'Executando';

  @override
  String get sessionToolStatusSucceeded => 'Pronto';

  @override
  String get sessionToolStatusFailed => 'Falhou';

  @override
  String get sessionToolStatusDenied => 'Recusada';

  @override
  String sessionToolTitled(String name, String title) {
    return '$name · $title';
  }

  @override
  String sessionToolRowLabel(String tool, String status) {
    return '$tool — $status. Mostrar o input exato';
  }

  @override
  String get sessionToolRowIn => 'IN';

  @override
  String get sessionToolRowOut => 'OUT';

  @override
  String get sessionToolRowInput => 'O input exato';

  @override
  String get sessionToolRowOutput => 'O que ela disse';

  @override
  String get sessionToolRowOutputLoading => 'Carregando a saída inteira…';

  @override
  String get sessionToolRowOutputFailed =>
      'A saída inteira não carregou — aqui está só o fim dela.';

  @override
  String sessionToolRowOutputTruncated(String size) {
    return 'A saída tinha $size: aqui estão só o começo e o fim, cortada onde está marcado.';
  }

  @override
  String get sessionToolRowOutputCut => '[… o meio da saída foi deixado de fora aqui …]';

  @override
  String get sessionImageAttached => 'Imagem anexada';

  @override
  String sessionImageAttachedWith(String details) {
    return 'Imagem anexada ($details)';
  }

  @override
  String get sessionImageOpen => 'Abrir a imagem';

  @override
  String get sessionImageClose => 'Fechar';

  @override
  String get sessionImageDescription => 'A imagem que este prompt levou, como o Claude a recebeu.';

  @override
  String get sessionImageLoading => 'Carregando a imagem…';

  @override
  String get sessionImageAlt => 'A imagem anexada ao prompt';

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
  String get sessionClosedIdleTimeout =>
      'Encerrada depois de ficar ociosa por tempo demais. Retome-a pelo histórico.';

  @override
  String get permissionPageTitle => 'Permissão';

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
  String get permissionOutcomeAllowedByAllowAll =>
      'Permitido pelo Permitir tudo, sem perguntar a ninguém.';

  @override
  String get permissionReachLabel => 'Alcance';

  @override
  String get permissionReachExact => 'Exatamente isto';

  @override
  String get permissionReachPrefix => 'Comandos que começam igual';

  @override
  String get permissionReachTool => 'Qualquer uso desta tool';

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
  String get permissionToolAskUserQuestion => 'Responder à pergunta do Claude';

  @override
  String get permissionQuestionLabel => 'Pergunta do Claude';

  @override
  String permissionQuestionProgress(int n, int total) {
    return 'Pergunta $n de $total';
  }

  @override
  String get permissionQuestionAnswered => 'respondida';

  @override
  String get permissionQuestionOther => 'Outro';

  @override
  String get permissionQuestionOtherPlaceholder => 'Digite sua resposta…';

  @override
  String get permissionQuestionRecommended => 'Recomendada';

  @override
  String get permissionQuestionPreview => 'Prévia';

  @override
  String get permissionQuestionSeePreview => 'Ver prévia';

  @override
  String get permissionQuestionBack => 'Voltar';

  @override
  String get permissionQuestionNext => 'Próxima';

  @override
  String get permissionQuestionSubmit => 'Enviar respostas';

  @override
  String get permissionQuestionDecline => 'Não responder';

  @override
  String get permissionQuestionDeclineReason => 'Por quê? O Claude lê isto (opcional)';

  @override
  String get permissionQuestionDeclineConfirm => 'Enviar sem responder';

  @override
  String get permissionQuestionDeclineBack => 'Voltar às perguntas';

  @override
  String get permissionQuestionExpired => 'Esta pergunta expirou. Nada foi enviado.';

  @override
  String get permissionQuestionMalformed =>
      'Não foi possível ler a pergunta do Claude, então ela não pode ser respondida aqui. Recusar avisa o Claude disso.';

  @override
  String get permissionQuestionWaiting => 'Aguardando sua resposta a uma pergunta';

  @override
  String permissionQuestionPill(String count) {
    return 'O Claude te perguntou algo ($count)';
  }

  @override
  String permissionQuestionAsked(String header) {
    return 'Perguntou: $header';
  }

  @override
  String permissionQuestionAskedMany(int count) {
    return 'Fez $count perguntas';
  }

  @override
  String get permissionQuestionPending => 'Aguardando resposta';

  @override
  String permissionQuestionDeclined(String reason) {
    return 'Não respondida: $reason';
  }

  @override
  String get permissionQuestionAnsweredElsewhere => 'Respondida em outro lugar';

  @override
  String get permissionErrorAnswersInvalid =>
      'Essas respostas não servem para a pergunta. Confira cada uma e envie de novo.';

  @override
  String permissionQuestionOtherAnswer(String text) {
    return 'Outro: $text';
  }

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
  String transcriptErrorFollowLimit(String limit) {
    return 'Há conversas demais sendo acompanhadas agora (no máximo $limit). Esta continua legível, mas não vai se atualizar sozinha.';
  }

  @override
  String get transcriptErrorFollowLiveHere =>
      'Esta conversa está aberta numa sessão viva aqui. Abra essa sessão para vê-la enquanto anda.';

  @override
  String transcriptErrorImageTypeUnsupported(String mediaType) {
    return 'Esta imagem não pode ser mostrada aqui: $mediaType não é um tipo que o servidor serve.';
  }

  @override
  String get transcriptErrorImageTooLarge => 'Esta imagem é grande demais para ser mostrada aqui.';

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
  String get historyResumeAction => 'Continuar esta conversa';

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
  String get historyActiveElsewhereNote =>
      'Outro processo escreveu nesta conversa há pouco — o editor ou um terminal pode estar com ela aberta. Continuar aqui cria uma cópia, e as duas vão divergir.';

  @override
  String get historyFollowWorking => 'Trabalhando em outro cliente…';

  @override
  String get historyFollowWorkingHelp =>
      'Isto é uma inferência, não algo que o Claude informou: a última entrada da conversa deixa o turno aberto — uma ferramenta sem resultado, um pensamento ou um prompt sem resposta — e algo escreveu nela há pouco. O histórico não grava o estado de um turno, e nada aqui diz qual é o outro cliente.';

  @override
  String get historyFollowNewerOne => '1 nova';

  @override
  String historyFollowNewer(int count) {
    return '$count novas';
  }

  @override
  String historyFollowNewerLabel(String newer) {
    return 'Ir para o fim — $newer';
  }

  @override
  String get sessionForkTitle => 'Continuar uma conversa que está sendo escrita agora?';

  @override
  String get sessionForkDescription =>
      'Outro processo — o editor ou um terminal — escreveu nesta conversa há pouco. Continuar aqui cria uma cópia com um id novo; a outra segue sozinha, e as duas vão divergir.';

  @override
  String get sessionForkCancel => 'Cancelar';

  @override
  String get sessionForkConfirm => 'Continuar como cópia';

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
  String get sessionErrorResumeTimeout =>
      'O backend não respondeu à retomada. Confira a conexão e tente de novo.';

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

  @override
  String get diagnosticsTitle => 'Diagnóstico';

  @override
  String get diagnosticsConnectionLabel => 'Conexão';

  @override
  String get diagnosticsCredentialLabel => 'Login';

  @override
  String get diagnosticsCredentialPresent => 'Conectado à conta';

  @override
  String get diagnosticsCredentialAbsent => 'Sem login';

  @override
  String get diagnosticsVersionLabel => 'Versão';

  @override
  String get diagnosticsDebugLabel => 'Log detalhado';

  @override
  String get diagnosticsDebugDescription =>
      'Registra toda troca com o servidor enquanto esta tela estiver aberta. Desliga sozinho quando você sai.';

  @override
  String get diagnosticsDebugAlwaysOn => 'Sempre ligado em um build de desenvolvimento.';

  @override
  String get sessionEndedResumes =>
      'Mandar um prompt a retoma, num novo processo do Claude nesta máquina.';

  @override
  String get sessionEndedResumeAndSend => 'Retomar e enviar';

  @override
  String get sessionEndedResuming => 'Retomando a conversa…';

  @override
  String get commonActionShowAll => 'Mostrar tudo';

  @override
  String sessionTurnLine(String costUsd, String seconds) {
    return 'Turno encerrado: $costUsd USD · $seconds s';
  }

  @override
  String get sessionCompactedManual => 'Compactada a pedido: o que veio antes agora é um resumo';

  @override
  String get sessionCompactedAuto =>
      'Compactada sozinha, o contexto encheu: o que veio antes agora é um resumo';

  @override
  String sessionCompactedManualTokens(String tokens) {
    return 'Compactada a pedido: $tokens tokens de antes agora são um resumo';
  }

  @override
  String sessionCompactedAutoTokens(String tokens) {
    return 'Compactada sozinha, o contexto encheu: $tokens tokens de antes agora são um resumo';
  }

  @override
  String get thinkingLive => 'Pensando…';

  @override
  String get thinkingDone => 'Pensou';

  @override
  String thinkingTook(String seconds) {
    return 'Pensou por $seconds s';
  }

  @override
  String thinkingTookMinutes(String minutes, String seconds) {
    return 'Pensou por $minutes min $seconds s';
  }

  @override
  String thinkingTookUpTo(String seconds) {
    return 'Pensou por até $seconds s';
  }

  @override
  String thinkingTookUpToMinutes(String minutes, String seconds) {
    return 'Pensou por até $minutes min $seconds s';
  }

  @override
  String get thinkingHidden => 'Pensou — o modelo não mostrou';

  @override
  String get thinkingNothingShown => 'O modelo pensou aqui e não mostrou o que pensou.';

  @override
  String get draftTitle => 'Uma nova conversa';

  @override
  String get draftDescription =>
      'Nada roda até você enviar o primeiro prompt: então uma sessão do Claude abre nesta pasta, com o que você escolheu abaixo.';

  @override
  String get draftCommands => 'Digite / para os comandos e skills desta instalação.';

  @override
  String get draftDefaultModel =>
      'Os modelos desta instalação aparecem depois que uma sessão desta pasta rodou; até lá, usa-se o padrão da instalação.';

  @override
  String get draftStarting => 'Abrindo a sessão…';

  @override
  String draftCatalogFailed(String reason) {
    return 'As escolhas desta instalação não puderam ser lidas, então a conversa começa com os padrões dela: $reason';
  }

  @override
  String get composerBoxLabel => 'Prompt';

  @override
  String get composerPlaceholder => 'Peça ao Claude algo nesta pasta…';

  @override
  String get composerQueue => 'Pôr na fila';

  @override
  String get composerQueued =>
      'O Claude está trabalhando: o que você enviar agora espera na fila e roda em seguida.';

  @override
  String get composerStop => 'Parar';

  @override
  String get composerEmpty => 'Escreva um prompt para enviar.';

  @override
  String get composerSlash => 'Comandos e skills (/)';

  @override
  String get composerMore => 'Mais escolhas: o modelo, o esforço e o contexto';

  @override
  String get composerRefusalClose => 'Fechar esta mensagem';

  @override
  String composerBlocked(String reason) {
    return 'Nada pode ser enviado agora: $reason';
  }

  @override
  String composerChoice(String label, String value) {
    return '$label: $value';
  }

  @override
  String get composerChoicePending => 'Trocando…';

  @override
  String get modeLabel => 'Modo';

  @override
  String get modeDefault => 'Perguntar';

  @override
  String get modeDefaultDescription =>
      'O Claude pergunta antes de cada tool que precisa da sua palavra.';

  @override
  String get modeAcceptEdits => 'Aceitar edições';

  @override
  String get modeAcceptEditsDescription =>
      'O Claude edita e grava arquivos sem perguntar; ainda pergunta antes do resto.';

  @override
  String get modeAcceptEditsWarning =>
      'O Claude vai editar e gravar arquivos sem perguntar — e sem a prévia da alteração.';

  @override
  String get modePlan => 'Plan';

  @override
  String get modePlanDescription =>
      'O Claude planeja sem mudar nada, e pede que você aprove o plano.';

  @override
  String get modeAllowAll => 'Permitir tudo';

  @override
  String get modeAllowAllDescription =>
      'O Claude executa toda tool sem perguntar, menos o que uma regra sua recusa. As perguntas dele a você continuam chegando.';

  @override
  String get modeAllowAllWarning =>
      'O Claude vai executar qualquer comando nesta máquina sem perguntar a você, até você trocar o modo.';

  @override
  String get modelLabel => 'Modelo';

  @override
  String get modelDefault => 'Padrão da instalação';

  @override
  String modelsFailed(String reason) {
    return 'Os modelos desta instalação não puderam ser lidos: $reason';
  }

  @override
  String get modelsLoading => 'Carregando os modelos';

  @override
  String get effortLabel => 'Esforço';

  @override
  String get effortDefault => 'Esforço padrão';

  @override
  String get effortLow => 'Baixo';

  @override
  String get effortMedium => 'Médio';

  @override
  String get effortHigh => 'Alto';

  @override
  String get effortXhigh => 'Muito alto';

  @override
  String get effortMax => 'Máximo';

  @override
  String get effortReadOnly =>
      'O esforço se escolhe quando a conversa começa. Trocá-lo com ela rodando faria o Claude parar de perguntar antes de cada tool.';

  @override
  String get effortUnknown => 'O do início';

  @override
  String get queueTitle => 'Prompts na fila';

  @override
  String get queueDescription =>
      'Estes rodam um depois do outro, como turnos próprios, quando o turno em execução terminar.';

  @override
  String queueCancel(String position) {
    return 'Tirar o prompt $position da fila';
  }

  @override
  String queuePosition(String position) {
    return '#$position';
  }

  @override
  String get queueFromWeb => 'de um navegador';

  @override
  String get queueFromMobile => 'do celular';

  @override
  String get queueFromOther => 'de outro cliente';

  @override
  String contextLabel(String percentage) {
    return 'Janela de contexto $percentage% usada';
  }

  @override
  String contextPercentage(String percentage) {
    return '$percentage%';
  }

  @override
  String contextWindow(String total, String max) {
    return '$total de $max tokens';
  }

  @override
  String contextTokens(String tokens) {
    return '$tokens tokens';
  }

  @override
  String get contextNear =>
      'A conversa está perto do limite do contexto. Compactá-la a mantém andando.';

  @override
  String get contextCompact => 'Compactar a conversa (/compact)';

  @override
  String get contextCompacting => 'Compactando…';

  @override
  String get contextUnavailable => 'O uso do contexto não pôde ser lido.';

  @override
  String get contextLoading => 'Lendo o contexto';

  @override
  String get contextSystemPrompt => 'Prompt de sistema';

  @override
  String get contextSystemTools => 'Tools do sistema';

  @override
  String get contextMcpTools => 'Tools de MCP';

  @override
  String get contextMessages => 'Mensagens';

  @override
  String get contextMemoryFiles => 'Arquivos de memória';

  @override
  String get contextSkills => 'Skills';

  @override
  String get contextFreeSpace => 'Espaço livre';

  @override
  String get contextBuffer => 'Reservado para compactação';

  @override
  String get sessionErrorQueuedPromptStarted =>
      'Esse prompt já começou. Interrompa o turno para pará-lo.';

  @override
  String get sessionErrorQueuedPromptNotFound => 'Esse prompt não está mais na fila.';

  @override
  String sessionErrorEffortUnsupported(String model, String level) {
    return '$model não aceita o nível de esforço $level.';
  }

  @override
  String get sessionStandingConnected => 'Conectado';

  @override
  String get sessionStandingReconnecting => 'Reconectando';

  @override
  String get sessionStandingRunning => 'Rodando';

  @override
  String get sessionStandingWaiting => 'Esperando você';

  @override
  String get sessionStandingEnded => 'Encerrada';

  @override
  String sessionStandingOpen(String standing) {
    return 'Status: $standing. Abrir os detalhes da sessão';
  }

  @override
  String get sessionDotConnected => 'Conectado — nada rodando';

  @override
  String get sessionDotReconnecting => 'Reconectando…';

  @override
  String get sessionDotRunning => 'O Claude está trabalhando';

  @override
  String get sessionDotWaiting => 'O Claude espera sua resposta';

  @override
  String get sessionDotEnded => 'A sessão terminou';

  @override
  String sessionDotSession(String sessionId) {
    return 'Sessão $sessionId';
  }

  @override
  String get sessionStatusTitle => 'A sessão';

  @override
  String get sessionStatusDescription =>
      'Como ela está, qual sessão é, e quanto custou desde que abriu.';

  @override
  String sessionStatusCost(String cost, String turns) {
    return 'Esta sessão custou $cost desde que abriu, em $turns turno(s)';
  }

  @override
  String get sessionStatusNoCost => 'Nenhum turno terminou ainda, então não há custo a dizer.';

  @override
  String get sessionMenuOpen => 'Mais ações da sessão';

  @override
  String get sessionMenuRules => 'Regras de permissão';

  @override
  String get sessionMenuUndo => 'Desfazer alterações de arquivo…';

  @override
  String get sessionMenuCopyId => 'Copiar o id da sessão';

  @override
  String get sessionMenuCopied => 'O id da sessão foi copiado.';

  @override
  String sessionMenuCopyFailed(String sessionId) {
    return 'Não foi possível copiar o id. Selecione e copie à mão: $sessionId';
  }

  @override
  String get sessionMenuHelp => 'Ajuda sobre esta tela';

  @override
  String get sessionMenuEnd => 'Encerrar sessão';

  @override
  String get sessionMenuEndNotOwner => 'Só o app que abriu esta sessão pode encerrá-la.';

  @override
  String get sessionMenuEndEnded => 'A sessão já terminou.';

  @override
  String get sessionCloseTitle => 'Encerrar esta sessão?';

  @override
  String get sessionCloseDescription =>
      'O Claude para nesta máquina. O que ele escreveu fica no disco, mas o desfazer das alterações de arquivo vai embora com a sessão. A conversa fica no histórico e pode ser retomada.';

  @override
  String get sessionCloseKeep => 'Manter rodando';

  @override
  String get sessionCloseConfirm => 'Encerrar a sessão';

  @override
  String get sessionHistoryOpen => 'Conversas desta pasta';

  @override
  String get sessionHistoryUnknown => 'A pasta desta sessão ainda não é conhecida';

  @override
  String get sessionHelpTitle => 'A tela de sessão';

  @override
  String get sessionHelpIntro =>
      'Só a conversa rola. A caixa fica embaixo, acima do teclado, com o que vale para o próximo prompt sob ela; o que a sessão está fazendo aparece na própria conversa, na ordem em que aconteceu.';

  @override
  String get sessionHelpBarHeading => 'A barra sob a caixa';

  @override
  String get sessionHelpBar =>
      'Nesta ordem: / lista os comandos e skills; depois o modo, o modelo, o esforço e a parte da janela de contexto em uso — com Compactar dentro dela — e enviar. Enquanto o Claude trabalha, enviar põe o que você escreveu na fila, e Parar fica ao lado; com a caixa vazia, o próprio botão é Parar. O esforço só se escolhe numa conversa nova. Numa tela estreita, o modelo, o esforço e o contexto vão para o … da barra.';

  @override
  String get sessionHelpMenuHeading => 'O menu da sessão';

  @override
  String get sessionHelpMenu =>
      'O … da barra de cima reúne o que se faz com a sessão inteira, e raramente: encerrá-la — só o app que a abriu pode, e ele pergunta antes —, desfazer as alterações de arquivo, copiar o id; e as regras de permissão e esta ajuda. O relógio ao lado abre as conversas desta pasta.';

  @override
  String get sessionHelpStatusHeading => 'O status';

  @override
  String get sessionHelpStatus =>
      'O chip da barra de cima diz como a sessão está, por cor e por palavra: conectada, reconectando, rodando, esperando você ou encerrada. Toque nele para ver o id da sessão, com o jeito de copiá-lo, e quanto ela custou desde que abriu.';

  @override
  String get sessionHelpWorkingHeading => 'Enquanto o Claude trabalha';

  @override
  String get sessionHelpWorking =>
      'Enquanto um turno roda, a última linha dele se mexe: um asterisco, o que o Claude está fazendo — a tool que executa, que espera você, ou uma palavra para o turno — e há quanto tempo. O raciocínio é uma linha própria, na ordem: \"Pensando…\" enquanto chega, \"Pensou por n s\" quando termina — o que pensou à vista, mais discreto que a resposta, quando o modelo mostrou; recolhido quando não mostrou. Uma tool é uma linha, recolhida: toque para ver o que entrou e o que saiu. Quando o turno acaba, a linha dá lugar ao que o turno custou.';

  @override
  String get sessionHelpInlineHeading => 'Perguntas na conversa';

  @override
  String get sessionHelpInline =>
      'Quando o Claude pergunta antes de executar uma tool, a pergunta fica na conversa, no lugar dessa tool: o comando exato, o risco, o tempo que resta e até onde vai um sim. Respondida, a linha da tool diz como — por você, no navegador, por uma regra sua, ou recusada porque ninguém respondeu a tempo. Uma pergunta nunca fecha o teclado nem tira a caixa de você: enviar continua enviando o seu prompt, e só um toque no card responde a ela.';

  @override
  String get sessionHelpPillHeading => 'Esperando sua resposta';

  @override
  String get sessionHelpPill =>
      'Com uma pergunta fora de vista — a conversa rolada para cima —, uma pílula sobre a caixa diz que o Claude espera, e quantas perguntas. Tocar nela leva à mais antiga.';

  @override
  String get sessionHelpTasksHeading => 'A lista de tarefas';

  @override
  String get sessionHelpTasks =>
      'Quando o Claude mantém uma lista de tarefas, ela fica sobre a caixa, recolhida numa linha — quantas estão feitas e o que está sendo feito agora. Toque nela para a lista inteira; ela muda enquanto o Claude trabalha, sem mexer no que você está lendo.';

  @override
  String get sessionHelpActionsHeading => 'A partir de um prompt';

  @override
  String get sessionHelpActions =>
      'Pressione e segure um prompt seu para o que dá para fazer a partir dele: editar e reenviar, bifurcar de antes dele, e devolver os arquivos a antes do turno dele — com o alcance mostrado arquivo a arquivo antes. O leitor de tela oferece as mesmas três como ações da mensagem. Enquanto o Claude trabalha, o desfazer espera o turno acabar; com a sessão encerrada não há desfazer.';

  @override
  String get permissionPlanLabel => 'O plano que o Claude propõe';

  @override
  String get permissionPlanTitle => 'Aprovar o plano?';

  @override
  String get permissionPlanModeLegend => 'Depois de aprovado, seguir';

  @override
  String get permissionPlanApprove => 'Aprovar o plano';

  @override
  String get permissionPlanCommentLabel => 'Ou diga o que mudar, e continue planejando';

  @override
  String get permissionPlanKeepPlanning => 'Continuar planejando';

  @override
  String get permissionPlanModeDefault => 'perguntando antes de cada edição';

  @override
  String get permissionPlanModeAcceptEdits => 'aceitando edições sem perguntar';

  @override
  String get sessionWorkingWaiting => 'Esperando sua resposta';

  @override
  String sessionWorkingRunningTool(String tool) {
    return 'Executando $tool…';
  }

  @override
  String sessionWorkingSeconds(String seconds) {
    return '$seconds s';
  }

  @override
  String sessionWorkingMinutes(String minutes, String seconds) {
    return '$minutes min $seconds s';
  }

  @override
  String get sessionWorkingVerbPondering => 'Ponderando…';

  @override
  String get sessionWorkingVerbDeciphering => 'Decifrando…';

  @override
  String get sessionWorkingVerbMulling => 'Matutando…';

  @override
  String get sessionWorkingVerbReasoning => 'Raciocinando…';

  @override
  String get sessionWorkingVerbWeighing => 'Pesando as opções…';

  @override
  String get sessionWorkingVerbSketching => 'Rascunhando…';

  @override
  String get sessionWorkingVerbUntangling => 'Desembaraçando…';

  @override
  String get sessionWorkingVerbAssembling => 'Montando…';

  @override
  String get sessionWorkingVerbTinkering => 'Ajustando…';

  @override
  String get sessionWorkingVerbExploring => 'Explorando…';

  @override
  String get sessionWorkingVerbConnecting => 'Ligando os pontos…';

  @override
  String get sessionWorkingVerbDistilling => 'Destilando…';

  @override
  String get sessionWorkingVerbBrewing => 'Preparando…';

  @override
  String get sessionWorkingVerbCrafting => 'Elaborando…';

  @override
  String get sessionWorkingVerbInvestigating => 'Investigando…';

  @override
  String get sessionWorkingVerbPuzzling => 'Quebrando a cabeça…';

  @override
  String get sessionWorkingVerbConsidering => 'Considerando…';

  @override
  String get sessionWorkingVerbComputing => 'Calculando…';

  @override
  String get sessionWorkingVerbWorking => 'Trabalhando…';

  @override
  String get sessionWorkingVerbMusing => 'Refletindo…';

  @override
  String sessionPendingPill(String count) {
    return 'O Claude espera sua resposta ($count)';
  }

  @override
  String get sessionInlineTail => 'Perguntas esperando você';

  @override
  String get sessionTasksLabel => 'A lista de tarefas que o Claude mantém nesta conversa';

  @override
  String sessionTasksHeadline(String done, String total, String task) {
    return '$done/$total · $task';
  }

  @override
  String sessionTasksAllDone(String done, String total) {
    return '$done/$total · Tudo feito';
  }

  @override
  String get sessionTaskPending => 'Pendente';

  @override
  String get sessionTaskInProgress => 'Em andamento';

  @override
  String get sessionTaskCompleted => 'Concluída';

  @override
  String sessionRewoundSummary(String restored, String kept) {
    return 'Arquivos devolvidos: $restored voltaram, $kept ficaram como estavam';
  }

  @override
  String sessionRewoundFailed(String restored, String kept, String failed) {
    return 'Arquivos devolvidos: $restored voltaram, $kept ficaram como estavam, $failed não puderam voltar';
  }

  @override
  String get sessionReplayPartial =>
      'Isto é só o que o servidor ainda tinha em memória, não a conversa inteira.';

  @override
  String get sessionMessageActions => 'O que fazer com este prompt';

  @override
  String get sessionMessageEdit => 'Editar e reenviar';

  @override
  String get sessionMessageForkFrom => 'Bifurcar daqui — reenviar sem mudar, numa nova conversa';

  @override
  String get sessionMessageUndo => 'Devolver os arquivos a antes deste prompt';

  @override
  String get sessionMessageUndoBusy =>
      'Devolver os arquivos a antes deste prompt — não enquanto o Claude trabalha';

  @override
  String get sessionMessageHold => 'Pressione e segure para o que fazer com este prompt';

  @override
  String get sessionEditEditing => 'Editando uma mensagem';

  @override
  String get sessionEditCancel => 'Parar de editar';

  @override
  String get sessionEditExplain =>
      'Você está editando um prompt: enviá-lo abre uma nova conversa a partir de antes dele. A conversa original fica como estava.';

  @override
  String get sessionEditResumeInstead => 'Retomar a conversa em vez disso';

  @override
  String get sessionForkStarting => 'Abrindo a nova conversa…';

  @override
  String get sessionErrorForkRejected =>
      'O Claude não conseguiu continuar a conversa a partir dessa mensagem. Retome a conversa e edite a partir dela.';

  @override
  String get sessionErrorForkPointUnknown =>
      'Essa mensagem não é um prompt desta conversa. Recarregue a conversa e tente de novo.';

  @override
  String get connectionTitle => 'Endereço do servidor';

  @override
  String get connectionDescription =>
      'Escolha como este celular chega ao seu servidor: o endereço da sua rede, o da internet ou outro. A API, a conexão ao vivo e o login passam todos por ele.';

  @override
  String get connectionInternal => 'Interno';

  @override
  String get connectionInternalHint => 'Na sua rede local';

  @override
  String get connectionExternal => 'Externo';

  @override
  String get connectionExternalHint => 'Pela internet';

  @override
  String get connectionOther => 'Outro';

  @override
  String get connectionOtherLabel => 'Endereço do servidor';

  @override
  String get connectionOtherHint => 'https://meu-servidor.example';

  @override
  String get connectionUndefined => 'Esta versão do app foi gerada sem este endereço.';

  @override
  String connectionInUse(String origin) {
    return 'Em uso: $origin';
  }

  @override
  String get connectionNone =>
      'Ainda não há endereço para chegar ao servidor: escolha um para entrar.';

  @override
  String get connectionNoticeUnavailable =>
      'O endereço salvo antes não é oferecido por esta versão do app, então o padrão está em uso.';

  @override
  String get connectionTest => 'Testar conexão';

  @override
  String get connectionTesting => 'Testando…';

  @override
  String connectionResultOk(String origin) {
    return 'O servidor e o login responderam em $origin.';
  }

  @override
  String connectionResultServerUnreachable(String origin) {
    return 'Nada respondeu em $origin: o servidor está fora do ar, fora do alcance desta rede, ou este não é o endereço dele.';
  }

  @override
  String connectionResultLoginUnavailable(String origin) {
    return 'O servidor respondeu em $origin, mas o login não.';
  }

  @override
  String get connectionSave => 'Salvar';

  @override
  String get connectionSwitchTitle => 'Trocar o endereço?';

  @override
  String get connectionSwitchBody =>
      'Trocar o endereço encerra o seu login: o próximo é com o servidor do novo endereço.';

  @override
  String get connectionSwitchConfirm => 'Trocar e sair';

  @override
  String get connectionSwitchCancel => 'Manter este endereço';

  @override
  String get connectionProblemEmpty => 'Escreva o endereço do servidor.';

  @override
  String get connectionProblemNotAnAddress => 'Isto não é um endereço: comece com https://';

  @override
  String get connectionProblemScheme => 'Só endereços https:// são aceitos.';

  @override
  String get connectionProblemPlainText =>
      'Aqui só https:// é aceito: http:// é só para o próprio celular (localhost) e, no app de desenvolvimento, para um IP da rede local (10.x, 172.16–31.x, 192.168.x), porque o login viajaria em texto aberto.';

  @override
  String get connectionProblemPath => 'Só o endereço do servidor: nada depois da /.';

  @override
  String get connectionProblemQuery => 'Só o endereço do servidor: sem ? depois dele.';

  @override
  String get connectionProblemFragment => 'Só o endereço do servidor: sem # depois dele.';

  @override
  String get connectionProblemUserInfo => 'O endereço não pode levar usuário nem senha.';

  @override
  String get connectionHelpOpen => 'Ajuda sobre o endereço do servidor';

  @override
  String get connectionHelpBody =>
      'O app chega ao seu servidor por um endereço só, e tudo passa por ele: a API, a conexão ao vivo e o login. Interno é o endereço da sua rede; externo é o da internet, quando o servidor está exposto; outro é qualquer endereço que você digitar. Só https:// é aceito, exceto para localhost. Teste a conexão antes de salvar: ela pergunta ao servidor e ao login, e diz qual não respondeu. A escolha fica neste celular mesmo depois de reiniciar ou sair. Trocá-la encerra o seu login, porque o próximo é com o servidor do novo endereço. Esta tela abre sem login, pela tela de entrada, para que um endereço errado nunca deixe você do lado de fora.';

  @override
  String get foldersTitle => 'Pastas';

  @override
  String get foldersOpenSection => 'Abertas';

  @override
  String get foldersRecentSection => 'Recentes';

  @override
  String get foldersOpenAnother => 'Abrir outra pasta';

  @override
  String get foldersNoneOpenTitle => 'Nenhuma pasta aberta';

  @override
  String get foldersNoneOpenBody =>
      'Abra uma pasta para começar uma sessão nela. As pastas abertas aqui são as mesmas das abas no navegador.';

  @override
  String get foldersNoRecent => 'Nenhuma outra pasta aberta antes.';

  @override
  String get foldersLoading => 'Lendo suas pastas…';

  @override
  String get foldersMissing => 'Esta pasta não existe mais no computador.';

  @override
  String get foldersNotAllowed => 'Esta pasta não está mais dentro de uma raiz liberada para você.';

  @override
  String foldersSessions(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count sessões abertas',
      one: '1 sessão aberta',
      zero: 'Nenhuma sessão aberta',
    );
    return '$_temp0';
  }

  @override
  String foldersPending(int count) {
    return '$count esperando você';
  }

  @override
  String get foldersLoadFailed => 'Não foi possível ler as sessões desta pasta.';

  @override
  String foldersActions(String name) {
    return 'Ações de $name';
  }

  @override
  String get foldersClose => 'Fechar pasta';

  @override
  String get foldersClosed => 'Pasta fechada. Nenhuma sessão foi encerrada.';

  @override
  String get foldersPin => 'Fixar';

  @override
  String get foldersUnpin => 'Desafixar';

  @override
  String get foldersForget => 'Tirar das recentes';

  @override
  String foldersLimitReached(String limit) {
    return 'Você já tem $limit pastas abertas. Feche uma para abrir outra.';
  }

  @override
  String get foldersHelpOpen => 'Ajuda sobre as pastas';

  @override
  String get foldersHelpBody =>
      'Abertas: as pastas em que você está trabalhando — as mesmas das abas de pasta no navegador. Cada uma diz quantas sessões estão abertas nela e quantos pedidos esperam você. Toque numa para ver as sessões e o histórico dela, ou para começar uma sessão nova.\n\nRecentes: pastas que você abriu antes. Toque numa para abri-la de novo; fixe as que você volta sempre.\n\nAbrir outra pasta: percorra as raízes em que este computador deixa o Claude rodar, um nível por vez, e abra a pasta que quiser.\n\nFechar uma pasta só a tira da lista: as sessões dela continuam rodando.';

  @override
  String get folderPickerTitle => 'Abrir uma pasta';

  @override
  String get folderPickerRoots => 'As raízes em que este computador deixa o Claude rodar';

  @override
  String get folderPickerOpenThis => 'Abrir esta pasta';

  @override
  String get folderPickerUp => 'Subir um nível';

  @override
  String get folderPickerEmpty => 'Nenhuma subpasta aqui.';

  @override
  String get folderPickerTruncated => 'Há pastas demais aqui: só as primeiras aparecem.';

  @override
  String get folderPickerLoading => 'Lendo a pasta…';

  @override
  String get folderNewSession => 'Nova sessão';

  @override
  String get folderOpenSessions => 'Sessões abertas';

  @override
  String get folderNoOpenSessions => 'Nenhuma sessão aberta nesta pasta';

  @override
  String get folderNoOpenSessionsBody =>
      'Comece uma com Nova sessão, ou abra uma do histórico abaixo.';

  @override
  String get folderSessionsLoading => 'Lendo as sessões abertas…';

  @override
  String get folderHistory => 'Histórico';

  @override
  String get folderHistorySeeAll => 'Ver todas';

  @override
  String get folderHistoryEmpty => 'Nenhuma conversa nesta pasta ainda.';

  @override
  String folderSessionDetails(String status, String model) {
    return '$status · $model';
  }

  @override
  String folderSessionStarted(String when) {
    return 'Iniciada $when';
  }

  @override
  String folderSessionBelow(String path) {
    return 'Em $path';
  }

  @override
  String get folderOpenedFromWeb => 'Aberta num navegador';

  @override
  String get folderOpenedFromMobile => 'Aberta num celular';

  @override
  String get folderHelpOpen => 'Ajuda sobre esta pasta';

  @override
  String get folderHelpBody =>
      'Nova sessão: um rascunho nesta pasta. Nada roda até você mandar o primeiro prompt.\n\nSessões abertas: o que roda agora nesta pasta e abaixo dela, aberto aqui, em outro celular ou num navegador. Toque numa para acompanhá-la; ela entra no painel de sessões desta pasta.\n\nHistórico: as conversas que o Claude guardou desta pasta. Abra uma para ler ou continuar.';

  @override
  String get liveStatusStarting => 'Iniciando';

  @override
  String get liveStatusIdle => 'Parada';

  @override
  String get liveStatusThinking => 'Pensando';

  @override
  String get liveStatusRunning => 'Executando uma ferramenta';

  @override
  String get liveStatusWaiting => 'Esperando você';

  @override
  String get liveStatusClosed => 'Encerrada';

  @override
  String get liveStatusUnknown => 'Status desconhecido';

  @override
  String get folderPanelOpen => 'Sessões desta pasta';

  @override
  String folderPanelTitle(String folder) {
    return 'Sessões de $folder';
  }

  @override
  String get folderPanelAll => 'Todas as sessões da pasta';

  @override
  String get folderPanelCurrent => 'Na tela';

  @override
  String get folderPanelWaitingElsewhere => 'Outra sessão desta pasta está esperando você';

  @override
  String get sessionCloseInApp => 'Fechar no app';

  @override
  String get sessionCloseInAppNote =>
      'Ela continua rodando; só sai desta lista. Abra de novo pela pasta.';

  @override
  String get workspaceErrorNotFound => 'Essa pasta não existe mais.';

  @override
  String get workspaceErrorNotADirectory => 'Isso é um arquivo, não uma pasta.';

  @override
  String workspaceErrorDirectoryUnreadable(String path) {
    return 'Este computador não consegue ler $path.';
  }

  @override
  String get folderNewSessionOffline => 'Esperando a conexão para começar uma sessão.';
}
