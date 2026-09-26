# Plano 02 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Device

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Qual é a identidade estável do aparelho: `installId` gerado pelo app, ou identificador do SO | o que acontece na reinstalação, e o que cada plataforma permite ler sem pedir permissão | B-02 | 2026-09-15 · **`installId` gerado pelo app**, no armazenamento seguro — é o que B-02 e S-02 já pressupõem | ✅ |
| D-02 | Quem pode aprovar um device: só o web, ou qualquer aparelho já aprovado | se o usuário terá acesso ao web no momento em que instalar o app | B-06 | 2026-09-15 · **só a partir do web**, como o [08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile) já manda | ✅ |
| D-10 | A unicidade do device é `installId` sozinho, ou o par `(userId, installId)` | nasceu de [D-03 do plano 01](../01-live-session/decisions.md) — multiusuário desde o dia 1 | B-02 | 2026-09-15 · **`(userId, installId)`** — uma linha por usuário e aparelho, e a aprovação de um nunca vale para o outro | ✅ |
| D-11 | O aparelho que fica pendente e nunca é aprovado expira? E há teto de aparelhos por usuário? | quantos aparelhos um usuário terá na prática — o mesmo gap que D-04 e D-07 citam | B-01, B-03 | 2026-09-15 · **pendente expira em 7 dias** e sai da lista; registrar de novo é abrir o app. Sem teto de aparelhos | ✅ |

| D-18 | O que "revogar invalida os refresh tokens do device" significa, num backend que nunca vê o refresh token do app | o app renova direto no provedor; o backend é Resource Server e não guarda credencial | B-04 | 2026-09-19 · **a credencial para de valer aqui**, em todo transporte, a partir do instante da revogação | ✅ |
| D-19 | Como o backend sabe de qual aparelho vem um socket | o handshake só levava `client.{kind, version}`, e sem aparelho não há como fechar o socket **daquele** device | B-04, B-05 | 2026-09-19 · **`client.installId` no handshake**, opcional; ausente é navegador | ✅ |

### D-01 — reconhecer o mesmo aparelho

Sem identidade estável, cada reinstalação cria um device novo — e a lista vira um cemitério que
ninguém revoga. Identificador do SO é estável demais em uma direção (persiste depois de
desinstalar, o que é uma questão de privacidade); `installId` nosso é honesto e some com o app.

**Decidido:** `installId` gerado na primeira execução e guardado no armazenamento seguro, com a
revogação do antigo ficando visível na lista. A linha estava aberta enquanto
[B-02](F0-device.md) e [S-02](scenarios.md) já escreviam `installId` como fato — fechar é
alinhar o registro ao que o plano já pressupõe, não mudar o plano.

Efeito: o `installId` entra no fluxo de registro do
[08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile),
que hoje lista só nome, plataforma, push token e locale.

### D-02 — quem aprova

A regra de [08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile)
é "aprovação a partir de uma sessão já confiável **(web)**". Se um aparelho aprovado pudesse
aprovar outro, um celular comprometido aprovaria o próximo.

**Decidido:** só o web aprova — o normativo já dizia, e o plano só entrega tela de devices no
web (`web/src/features/devices/`, sem nada equivalente no mobile). O preço, registrado: o
primeiro aparelho depende de um navegador, e quem estiver longe da máquina fica sem caminho.
Reabrir isso é **ADR** contra o 08-authentication, não decisão de plano.

### D-10 — o mesmo aparelho, duas contas

`Device` é ancorado no `User` (B-01), mas a identidade é do aparelho. Com multiusuário
decidido, o registro do usuário B no mesmo celular pode sobrescrever a linha já aprovada do
usuário A — aprovação herdada em silêncio, que é o oposto do que a F0 existe para garantir.
S-02 diz "registro repetido do mesmo `installId` atualiza, não duplica" sem dizer **de quem**.

**Decidido:** unicidade em `(userId, installId)`. Custa uma coluna no índice e fecha o caminho
de herdar aprovação; decidir depois seria migration em tabela que já tem dado.

Efeitos, os dois na mesma entrega de B-02: o índice único da migration é composto, e
[S-02](scenarios.md) passa a dizer *"do mesmo usuário"* — do jeito que está escrito, ele passaria
verde com a chave errada.

### D-11 — o pendente esquecido

A máquina de estados era `pending → approved → revoked`, sem saída para o aparelho que ninguém
aprovou. Ele ficaria na lista para sempre, e lista longa de pendentes é como se aprova por
cansaço o aparelho errado, meses depois.

**Decidido:** o registro pendente expira em 7 dias e some da lista. O custo para quem foi
esquecido é abrir o app de novo; o ganho é que a lista onde se aprova tem só o que é recente e
reconhecível. Sem teto de aparelhos — o número real não é o problema, a idade é.

**Tarefa que esta decisão cria:** a expiração do pendente na F0, junto de B-03, com os cenários
de fronteira (6º dia vive, 8º não) e de idempotência (expirar duas vezes não muda nada).

### D-18 — o que a revogação consegue prometer

[B-04](F0-device.md) e o
[08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile) dizem
que revogar um device "invalida os refresh tokens dele imediatamente". Na implementação isso
encontrou um fato do desenho: **o backend nunca tem o refresh token do app**. Ele é Resource
Server — valida token, não emite —, e o app renova direto contra o provedor, por
`flutter_appauth`. Não há o que revogar no provedor sem guardar a credencial, e guardá-la é
proibido em três documentos.

**Decidido:** a revogação garante que a credencial **para de valer aqui**, em todo transporte, a
partir daquele instante — as connections abertas fecham com `4401`, um novo handshake daquele
`installId` é recusado, e toda ação que decide é recusada com `DEVICE_REVOKED`. O que ela não faz,
e agora está dito: encerrar a sessão do usuário no provedor. Quem quiser isso usa o logout, que é
[B-25](F3-mobile-permission.md).

O preço, registrado: o access token daquele aparelho continua sendo um token válido **para o
provedor** até expirar. Ele não abre nada neste backend, que é o que importa aqui; se algum dia
outro serviço aceitar o mesmo `audience`, esta linha reabre como ADR.

Efeito: [S-08](scenarios.md) passa a dizer "a credencial para de valer", que é o que o cenário de
integração prova, em vez de "invalida os refresh tokens", que nenhum teste poderia provar.

### D-19 — de qual aparelho vem este socket

O handshake levava `client: { kind, version }` e mais nada. Com isso, **B-04 não era
implementável**: não há como fechar "as connections daquele device" se nenhuma connection sabe de
qual device é. E B-05 teria de descobrir o aparelho por outro caminho a cada comando.

**Decidido:** `client.installId`, opcional, no `connection.authenticate`. Ausente é o navegador,
que não é device e nunca vira um — e é essa ausência que a regra de aprovação lê.

Mudança de contrato, então mudança nas três pontas na mesma entrega:
[connection-authenticate.schema.json](../../../packages/contracts/schema/commands/connection-authenticate.schema.json),
o TypeScript e o Dart regerados, e o
[05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#handshake) atualizado
com a regra que veio junto: `installId` sem registro, ou revogado, fecha com `4401`; **pendente
conecta**.

Na mesma decisão veio o lado HTTP: o app manda `x-install-id` em toda requisição. Header, e não
campo de corpo, porque é propriedade de **quem chama** e precisa ser legível num `GET` e num
`DELETE`. Ele não autentica nada — diz qual dos aparelhos do usuário está pedindo —, e é a
ausência dele que faz o `POST /devices/:id/approval` saber que quem chama é um navegador
([D-02](#d-02--quem-aprova)).

**Tarefa que esta decisão cria:** nenhuma. Ela é o meio de B-04 e B-05, e entrou com elas.

---

## F1 — Push

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-03 | **Qual provedor de push**: FCM + APNs direto, ou um intermediário | conta, custo, onde o segredo mora e quem administra — **D-12 fechou**: é FCM, direto ou por intermediário | B-09, e a F1 inteira | 2026-09-15 · **FCM direto**, com o segredo na configuração do backend e o nome fora de todo o resto | ✅ |
| D-04 | Com vários aparelhos aprovados, o push vai para todos ou só para o último ativo | quantos aparelhos um usuário terá na prática | B-10 | 2026-09-15 · **todos os aparelhos aprovados** do usuário, como S-25 já exige | ✅ |
| D-05 | Falha do provedor de push tem segundo canal (e-mail, por exemplo), ou só `warn` | quanto tempo uma permissão pode ficar esperando sem ninguém saber | B-09 | 2026-09-15 · **só `warn`**, sem segundo canal — B-09 e S-23 já estão escritos assim | ✅ |
| D-12 | **Quais plataformas de celular entram neste plano**: Android, ou Android e iOS | onde estão os aparelhos de quem vai usar isto, e se há conta Apple paga | D-03, B-09, B-22, B-28 | 2026-09-15 · **só Android neste plano** — o iOS continua compilando, sem push, biometria nem e2e exercitados, e isso é escopo declarado | ✅ |
| D-13 | Token de push rotacionado ou recusado pelo provedor: o app reenvia, e o backend limpa o token morto mantendo o device aprovado? | com que frequência o provedor troca o token no uso real | B-09, B-13 | 2026-09-15 · **o app reenvia o token a cada renovação; token recusado pelo provedor é apagado e o device continua aprovado** | ✅ |
| D-14 | O que o produto faz quando o usuário **nega** a permissão de notificação do SO | quantos negam na primeira vez, e se voltam atrás | B-13 | 2026-09-15 · **explica no app e segue** — aprovação com o app aberto, com atalho para as configurações do SO | ✅ |
| D-15 | Vários pedidos pendentes ao mesmo tempo: uma notificação por pedido, uma agrupada, ou substituição | quantos pedidos simultâneos acontecem numa sessão real | B-10 | 2026-09-15 · **uma notificação por pedido**, agrupadas pelo SO, cada uma cancelada com o seu pedido | ✅ |

| D-20 | Onde vive o segredo do provedor de push, e o que acontece quando ele falta | a credencial é uma chave privada; a allowlist já provou que arquivo é melhor que variável, mas ela derruba o boot e push não é fronteira de segurança | B-09 | 2026-09-19 · **arquivo** em `RC_PUSH_CREDENTIALS_FILE`, e ausente **não** derruba o boot | ✅ |
| D-21 | Onde vive o SDK do fornecedor **no aparelho**, já que o S-26 proíbe o nome dele em `mobile/lib/**.dart` | receber push na Android exige a biblioteca do fornecedor, e um `import` dela é uma linha de Dart com o nome escrito | B-13, B-31, B-32 | 2026-09-19 · **atrás de um `MethodChannel`**: o Dart conhece uma porta e um canal, o fornecedor vive em `android/` e na configuração | ✅ |

### D-03 — o provedor, e o que ele **não** pode saber

É o [R-01](README.md#riscos-e-decisões-em-aberto) e bloqueia a fase inteira: o adapter, o
segredo e o teste mudam conforme a escolha.

- **FCM + APNs direto**: sem intermediário, duas integrações e dois conjuntos de credenciais.
- **Um intermediário** (um serviço que fala com os dois): uma integração, mais um terceiro no
  caminho de uma decisão de segurança.

Com [D-12](#f1--push) fechada em Android, o APNs sai de cena.

**Decidido:** FCM direto. Uma integração, um segredo — a credencial de service account, que vive
na configuração e **nunca** no repositório ([secrets-scan](../../../scripts/secrets-scan.mjs) é
quem cobra isso) — e nenhum terceiro a mais vendo que existe um pedido de permissão esperando,
que é o que o R-02 pede.

O que a decisão **não** fecha, e é trabalho de quem opera: criar o projeto do provedor e dizer
quem o administra. A F1 não depende disso para ser escrita — depende para ser provada
fim a fim.

Vale para qualquer escolha: o nome dele **não sai da configuração**, o payload não carrega
conteúdo de arquivo nem output de comando, e a tela revalida no servidor antes de renderizar.

### D-20 — onde vive o segredo, e o que ele não pode derrubar

A credencial do provedor é uma chave privada de service account. Chave privada em variável de
ambiente é chave privada em todo `ps`, em todo crash dump e em todo `docker inspect` — o mesmo
argumento que pôs a allowlist num arquivo ([backend/03 · D-02](../../architecture/backend/03-modules.md#workspace)).

**Decidido:** três valores de configuração — `RC_PUSH_ENDPOINT`, `RC_PUSH_CREDENTIALS_FILE` e
`RC_PUSH_SCOPE` — com a credencial num **arquivo**, e nenhum deles nomeando fornecedor nenhum.

O que difere da allowlist, e é a parte que precisa estar dita: **arquivo ausente não derruba o
boot**. A allowlist é a fronteira de segurança do produto e um backend no ar com ela quebrada é
pior que fora do ar; push é melhor esforço ao lado de um prazo que não é. Um backend que se
recusasse a subir porque ninguém configurou notificação ainda trocaria o produto inteiro por uma
das suas conveniências. O preço é o que [D-05](#d-05--quando-o-push-não-sai) já registra.

**Tarefa que esta decisão cria:** nenhuma — é o meio de B-09. O que ela cria é uma **regra de
máquina**: `scripts/lib/vendor-name-rules.mjs`, rodada por `pnpm scan:security` sobre backend, web
e app, que é o que [S-26](scenarios.md) pede e o que impede o nome do fornecedor de escapar da
configuração.

### D-04 — todos ou o último

Notificar todos os aparelhos maximiza a chance de alguém ver e multiplica o ruído; notificar só
o último ativo é silencioso e falha exatamente quando o aparelho ficou para trás.

**Decidido:** todos os aparelhos aprovados. É o que [S-25](scenarios.md) já exige, e é a escolha
coerente com a razão de o app existir — uma permissão que ninguém vê é uma sessão parada até o
timeout negar sozinho. O ruído que isso cria é o que D-15 precisa resolver.

### D-05 — quando o push não sai

**Decidido:** só `warn`, sem segundo canal — como [B-09](F1-push.md) e [S-23](scenarios.md) já
estão escritos. O pedido continua válido no web e o timeout continua sendo quem decide no
silêncio.

O preço, registrado para não ser esquecido: quando o push falha e ninguém está no navegador, a
permissão espera o timeout inteiro **sem ninguém saber**. D-13 e D-14 tratam as duas formas mais
prováveis de isso acontecer sem ser falha do provedor.

### D-12 — quais aparelhos, de verdade

O repositório tem `mobile/ios/Runner`, e a arquitetura cita Keychain e
`ASWebAuthenticationSession` ([mobile/07-auth](../../architecture/mobile/07-auth.md)) — mas a F4
é inteiramente Android (Gradle, emulador, cgroup), e o
[plano 06 · D-01](../06-distribution/decisions.md) decide o SO da **instalação do backend**, não
o do celular. Ninguém decidiu o escopo do aparelho em lugar nenhum.

Com iOS no escopo entrariam conta de desenvolvedor paga, certificado APNs, biometria por
`LAContext` e um caminho de `integration_test` que o plano não tem — e a F4 precisaria de runner
próprio.

**Decidido:** só Android. O que essa escolha compra: D-03 vira uma integração só, e o e2e
continua no emulador cercado por cgroup que o [plano 00](../00-bootstrap/F6-scripts-e2e.md) já
provou. O que ela custa, e que **precisa estar dito e não subentendido**: o app continua
compilando para iOS com push, biometria e `integration_test` nunca exercitados ali — a linha
entra no **Não entra** do [README](README.md#escopo), e reabrir o iOS é decisão do
[plano 06](../06-distribution/README.md), onde a distribuição é decidida.

### D-13 — o token que morre calado

O token era registrado no login e desregistrado no logout, sem nada entre os dois. O FCM troca o
token e devolve "não registrado" para o antigo; [S-23](scenarios.md) trata falha do provedor como
`warn`, que é o tratamento certo para um blip e o errado para uma condição permanente. O efeito
era o pior possível: a aprovação de longe parava de chegar e ninguém sabia.

**Decidido:** o app reenvia o token a cada renovação do provedor, e o backend apaga o token que o
provedor recusa **mantendo o device aprovado** — ele volta a receber assim que o app abrir.
Revogar o device seria cobrar uma nova aprovação pelo web a cada troca de token do SO.

**Tarefa que esta decisão cria:** o reenvio na F1, junto de B-13, e o descarte do token recusado
em B-09 — com o cenário de idempotência (reenviar o mesmo token não duplica linha) e o de erro
(token recusado some, device continua aprovado).

### D-14 — o usuário que nega a notificação

É o único caminho que faz o plano inteiro perder a função, e estava sem cenário e sem tarefa.

**Decidido:** o app explica, com todas as letras, que sem notificação a aprovação só acontece com
ele aberto, e oferece o atalho para as configurações do SO. Recusar a aprovação nesse aparelho
seria tirar o produto de quem apenas prefere abrir o app; ficar silencioso seria pior ainda — o
usuário concluiria que o produto não notifica.

**Tarefa que esta decisão cria:** o estado de "notificação negada" na F1, junto de B-13, mais o
cenário de widget correspondente. O `patrol` dirige esse diálogo do SO
([mobile/06-testing](../../architecture/mobile/06-testing.md)), então o caminho real também é
exercitável.


### D-15 — três pedidos na bandeja

**Decidido:** uma notificação por pedido. É o que preserva o deep link por pedido, que é o que faz
o toque abrir **no card certo** — e abrir o card errado com pressa é o acidente que a F3 inteira
existe para evitar. O agrupamento nativo do Android cuida da aparência, e o cancelamento
continua sendo por `requestId`, como B-10 já faz.
---

### D-21 — o fornecedor não atravessa a fronteira do Dart

O [S-26](scenarios.md) virou regra de máquina em B-09, e ela varre `mobile/lib/**.dart`. Receber
push na Android exige a biblioteca do fornecedor; um `import` dela é uma linha de Dart com o nome
escrito, e o portão cai — corretamente. As duas saídas ruins eram abrir exceção na regra, que é o
anti-padrão que o [AGENTS.md](../../../AGENTS.md) rejeita por nome, e renomear o import para
enganar o scanner, que é pior.

**Decidido:** o Dart conhece **uma porta** — `PushGateway`, em `core/notifications/` — e um
`MethodChannel` chamado por um nome do produto, não do fornecedor. A biblioteca vive onde
biblioteca de plataforma vive: em `android/`, com o segredo em arquivo de configuração. É a mesma
divisão que o backend já faz, onde `adapter/outbound/push/` conhece um endpoint e uma credencial e
nunca quem responde por eles.

Isso tem uma consequência que precisa ser dita: **sem transporte configurado, o canal responde
"indisponível"**, e o app entra num estado próprio — *não* no estado de notificação negada do
[D-14](#d-14--o-usuário-que-nega-a-notificação). Os dois textos são diferentes de propósito: um
usuário que negou pode voltar atrás nas configurações do SO; um build sem transporte não tem o que
o usuário possa fazer, e dizer "você negou" seria mentira. A montagem do projeto do fornecedor
continua sendo trabalho de quem opera, como a F1 já dizia.

## F2 — Sessão no app

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | No `attach` **frio** (sem `lastSeq`), quantos eventos do buffer o app pede antes de existir transcript | o teto já é normativo — ring buffer de 1000 eventos por sessão ([05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md)); falta o que é útil num celular | B-14 | 2026-09-15 · **os 1000 eventos do buffer**, sem página própria para o celular | ✅ |

### D-06 — quanto do passado cabe no celular

Pedir poucos demais faz a tela abrir com um pedaço de conversa sem começo — e quem abre o app no
meio de uma execução para aprovar algo precisa ver o que veio antes.

**Decidido:** o app pede o que o backend tiver, os mesmos 1000 eventos do web. Uma página própria
para o celular seria um segundo caminho de replay para manter, testar e explicar, e o buffer já
é limitado por desenho. O preço é rede e memória no aparelho mais fraco: se aparecer, aparece
como número medido, e aí vira decisão nova — não suposição agora.

O histórico de verdade continua sendo o [plano 04](../04-transcript-and-resume/README.md).

---

## F3 — Permissão no app

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | O que fazer em aparelho sem biometria **e** sem PIN configurado | quantos aparelhos assim existem no uso real | B-22 | 2026-09-15 · **recusa a aprovação nesse aparelho**, com o motivo escrito na tela; observar sessão continua permitido | ✅ |
| D-08 | A confirmação em dois passos vale para toda tool, ou só para `riskHint: destructive` | dependia de [D-08 do plano 01](../01-live-session/decisions.md) — **fechado em 2026-09-15** | B-21 | 2026-09-15 · **só `riskHint: destructive`**, como [mobile/04-ui](../../architecture/mobile/04-ui.md#a-tela-de-permissão) já normatiza | ✅ |
| D-16 | O app oferece **estender o prazo** do pedido, ou a extensão é só do web | quantas vezes 120 s é pouco para quem decide no celular | B-20, B-24 | 2026-09-15 · **sim**, com valor e teto vindos da configuração, como o [01 · D-09](../01-live-session/decisions.md) fixou | ✅ |
| D-22 | Com o que o deep link **revalida no servidor**: o replay do `session.attach`, ou uma consulta própria | o attach republica os pendentes, mas não diz quando acabou de republicar — "não veio" não prova "não existe" | B-23 | 2026-09-24 · **`GET /sessions/:sessionId/permissions/:requestId`**, que responde o estado real: pendente, resolvido (com quem), `410` expirado, `404` desconhecido, `403` de outro usuário | ✅ |
| D-23 | Em que ordem o logout acontece, se desregistrar o push precisa da credencial que o logout apaga | se o token em memória sobrevive à limpeza do armazenamento seguro | B-25 | 2026-09-24 · **desregistrar primeiro**, enquanto a credencial vale; depois o armazenamento, o provedor, o socket e os providers | ✅ |
| D-24 | Como conversa e fila de permissão observam a mesma sessão pelo único socket do app | o `WsClient` guardava **um** assinante por sessão, e o segundo apagava o primeiro | B-24 | 2026-09-24 · **vários assinantes por sessão**, como no web: anexa uma vez, retoma do mais atrasado, desanexa com o último | ✅ |
| D-25 | O que "desligável" desliga na biometria, e onde a preferência mora | se desligar a biometria reabre o caso do D-07 | B-22 | 2026-09-24 · desligar **tira o pedido de biometria/PIN**, não a regra do D-07: aparelho sem bloqueio continua sem aprovar. A preferência fica no armazenamento seguro, ligada por default | ✅ |

### D-22 — revalidar é perguntar, não esperar

O [mobile/03](../../architecture/mobile/03-state-and-data.md#push-notification--o-canal-que-torna-o-app-útil)
manda revalidar no servidor antes de renderizar. O caminho barato seria o que o socket já faz: ao
`session.attach`, o backend republica os pedidos ainda pendentes. Ele serve para o caso bom e não
para o ruim — os pendentes chegam depois do `ack`, sem marcador de fim, e a ausência do pedido
depois de *n* milissegundos é um palpite, não uma resposta. Um card que some porque o frame demorou
e um card que some porque o pedido acabou pareceriam iguais.

**Decidido:** uma consulta HTTP que responde **o estado**, lido do mesmo registro em memória que o
attach usa. Os quatro desfechos têm o código que a [D-17 do plano 01](../01-live-session/decisions.md)
manda usar: `200` com o pedido pendente (e quantas extensões restam), `200` com a resolução (e de
onde veio), `410 PERMISSION_REQUEST_EXPIRED`, `404 PERMISSION_REQUEST_NOT_FOUND` e
`403 PERMISSION_NOT_OWNED`. Responder uma permissão continua sendo pelo socket, e só depois que o
attach reentregar o frame: é ele que dá o `correlationId`, e é o attach que o backend exige de quem
responde.

### D-23 — a ordem do logout

O [mobile/07-auth](../../architecture/mobile/07-auth.md#logout) lista cinco passos, com "limpa o
armazenamento" primeiro. Desregistrar o push é uma chamada ao backend, e ela precisa do token que o
primeiro passo apaga — na ordem escrita, o passo 4 falharia sempre, calado, e o aparelho seguiria
recebendo notificação da conta que saiu.

**Decidido:** o desregistro vai **antes**, e falhar nele é `warn`, nunca motivo para não sair
(S-88): um logout que não completa sem rede deixa a credencial no aparelho, que é o pior dos
desfechos. Depois vêm o armazenamento, o `end_session_endpoint`, o socket e os providers. O
normativo foi corrigido junto.

### D-24 — duas telas, um socket

A fila de permissão e a conversa são features diferentes olhando o mesmo stream. O `WsClient` do app
guardava um assinante por sessão, então a segunda a anexar calava a primeira, e o desanexar de uma
mandava `session.detach` com a outra ainda na tela. O web já tinha resolvido isso; o app passa a
fazer o mesmo: anexa uma vez, retoma do assinante mais atrasado (reentregar o que alguém já aplicou
custa nada, porque descartar `seq <= lastSeq` é a primeira regra de todo estado), e desanexa com o
último (S-82). O app também passa a entregar frames `request` — até aqui só `event` chegava a quem
assinava, e `permission.requested` é exatamente um `request`.

### D-25 — o que a chave desliga

A biometria é "ligada por default e desligável" ([mobile/07-auth](../../architecture/mobile/07-auth.md#biometria)).
Se desligar a chave também desligasse o D-07, um aparelho sem bloqueio aprovaria depois de um toque
num switch — a regra viraria sugestão.

**Decidido:** a chave tira o **pedido** de biometria/PIN antes de aprovar. Um aparelho sem nenhum
bloqueio continua sem aprovar, com a chave em qualquer posição. Negar nunca pede biometria: é a
decisão segura, e pôr uma barreira nela só atrasa o "não". A preferência não é credencial, mas mora
no armazenamento seguro para não trazer uma segunda dependência de armazenamento só para um booleano.

### D-07 — quando o aparelho não tem barreira

A regra é clara sobre o caminho de baixo: biometria indisponível **cai para o PIN**, nunca para
"aprovar direto" ([mobile/07-auth](../../architecture/mobile/07-auth.md)). Faltava a ponta: um
aparelho sem nenhuma das duas.

**Decidido:** recusa. O aparelho continua observando sessão — é a mesma assimetria de B-05, em
que pendente observa e não decide —, e a tela diz **por quê**, com o caminho para configurar o
bloqueio. Botão desabilitado sem motivo é regra de segurança que parece bug.

### D-08 — dois passos, para quê

**Decidido:** só para `riskHint: destructive`. O que estava travado era o gap, não a escolha:
sem saber quem classifica o risco, "só destrutiva" poderia significar "quase nada é destrutiva".
O [plano 01 · D-08](../01-live-session/decisions.md) fechou isso com classificação **fail
closed** — comando que a heurística não reconhece é marcado como destrutivo —, e é ela que
sustenta esta decisão. Se a classificação deixar de falhar fechado, esta linha reabre.

### D-16 — estender pelo celular

O [plano 01 · D-09](../01-live-session/decisions.md) criou o comando de extensão do timeout, e o
pôs na F0 daquele plano justamente para o contrato não mudar no meio do caminho; o
[B-43](../01-live-session/F6-e2e.md) é explícito em que "o app não ganha tela naquele plano".
Ou seja: usar o comando no celular é trabalho **deste** plano, e hoje não existe tarefa nem
cenário — B-20 desenha a contagem regressiva e mais nada.

**Decidido:** o app oferece estender. Quem decide de longe é quem tem menos contexto para
decidir depressa, e a alternativa — deixar expirar e esperar o Claude perguntar de novo — é pior
para a mesma sessão. O timeout continua sendo a única proteção contra sessão pendurada, então
valor e teto vêm da **configuração**: o app manda o comando, não escolhe o número.

**Tarefa que esta decisão cria:** a ação de estender no card da F3, junto de B-20/B-24, com os
cenários de fronteira que aquela decisão já exige — teto atingido, e extensão que chega depois
de a permissão ter sido resolvida.

---

## F4 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-09 | Qual imagem de emulador e API level o `integration_test` usa de forma reprodutível | **não é custo** — a primeira execução já aconteceu no [plano 00](../00-bootstrap/progress.md) (cgroup, 4 núcleos, 7 GB); o que não existe é a imagem fixada em lugar nenhum | B-28 | 2026-09-15 · **API 35 fixada** — a imagem com que o plano 00 saiu verde, e o mínimo que exibe o diálogo de permissão de notificação | ✅ |
| D-26 | Como provar a entrega real do push e o diálogo do SO sem tirar a hermeticidade da suíte padrão | se o emulador fixado tem Play Services (tem: `google_apis_playstore`), e o que alcança a UI do sistema | B-28, B-34 | 2026-09-24 · **uma variante opt-in**, `pnpm test:e2e:mobile:push`: mesma stack, com o push do `.env` no lugar de `push.invalid`, rodada pelo `patrol`, que aperta `home`, responde o diálogo e toca a notificação. A suíte padrão continua hermética | ✅ |
| D-17 | Como o celular alcança o backend fora da rede local | é o [plano 06 · D-04](../06-distribution/decisions.md) — túnel, VPN ou porta com TLS | nada nesta fase | — | ⛔ |

### D-09 — o emulador reprodutível

[scripts/mobile.mjs](../../../scripts/mobile.mjs) exige "um device" e nada mais: emulador,
simulador ou aparelho real. Isso basta para rodar sob demanda e não basta para um resultado
comparável entre duas máquinas — API level diferente muda permissão de notificação, biometria e
deep link, que é exatamente o que o `integration_test` deste plano exercita.

**Decidido:** API 35, fixada no script e dita no README. É a imagem que o
[plano 00](../00-bootstrap/F6-scripts-e2e.md) usou para sair verde, e API 33 é o piso para o
diálogo de permissão de notificação existir — em imagem mais antiga, o cenário que D-14 criou
simplesmente não aparece, e a suíte passaria sem provar nada.

Uma imagem só, não duas: a suíte já é a mais cara do repositório, e o caminho antigo não tem
usuário conhecido para justificar dobrar o tempo.

### D-26 — o push de verdade, sem sujar a suíte de todo dia

S-54 e S-67 só existem com três coisas que a suíte hermética recusa por desenho: um provedor de push
real, o app **fora** da tela (com ele aberto o backend não manda push — S-16) e alguém que toque na
UI do sistema. As duas credenciais estão no workspace, e o emulador fixado tem Play Services.

**Decidido:** uma variante à parte, que ninguém roda sem pedir. Ela lê o push do `.env` — e só isso
do `.env` — e roda um teste do `patrol`, que é o que alcança o sistema: responde o diálogo de
notificação, manda o app para o fundo e toca a notificação quando ela chega. A suíte padrão não muda:
continua apontando o push para `push.invalid`, e continua rodando sem rede para fora da máquina.

### D-17 — o produto fora da mesa

A F4 passa verde com `adb reverse`, na mesma máquina; a **promessa** do plano é decidir de longe.
Os dois convivem: a fase não depende da resposta, o produto depende. Fica aqui, ⛔ travada por
terceiro, para que a lacuna apareça agora e não no dia da instalação.

---

## Propagação

Decisão registrada só aqui é decisão que o resto do repositório não conhece. Estas viraram
**regra** no documento normativo, em 2026-09-16:

| Decisão | Onde virou regra |
|---|---|
| D-01, D-10, D-11 | [08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile) — `installId` no fluxo de registro, unicidade em `(userId, installId)`, e o pendente expirando em 7 dias |
| D-04, D-05, D-13, D-15 | [backend/03-modules](../../architecture/backend/03-modules.md#notification) — push para todos os aparelhos aprovados, uma notificação por pedido, falha do provedor como `warn` sem segundo canal, e o token recusado apagado com o device mantido |
| D-07 | [mobile/07-auth](../../architecture/mobile/07-auth.md) — aparelho sem biometria **e** sem PIN não aprova, e a tela diz por quê |
| D-08 | [mobile/04-ui](../../architecture/mobile/04-ui.md#a-tela-de-permissão) — dois passos só para `destructive`, apoiado no `riskHint` que falha fechado |
| D-09, D-12 | [mobile/06-testing](../../architecture/mobile/06-testing.md#e2e) — a suíte é Android, o iOS compila sem ser exercitado, e a imagem é API 35 |
| D-10 | [backend/05-persistence](../../architecture/backend/05-persistence.md#o-device-do-celular) — o índice único composto, nascendo composto na migration |
| D-14, D-16 | [mobile/04-ui](../../architecture/mobile/04-ui.md#a-tela-de-permissão) — a ação de estender no card, e a tela de notificação negada |
| D-02 | nada a propagar — a escolha **já** é o que o normativo diz ([08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile)) |
| D-18 | [08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile) — o que a revogação garante, e o que ela não garante (2026-09-19) |
| D-20 | [.env.example](../../../.env.example) e [backend/03-modules](../../architecture/backend/03-modules.md#notification) — os três valores, e o boot que não cai (2026-09-19) |
| D-19 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#handshake) — `client.installId`, e o que o handshake recusa (2026-09-19) |
| D-21 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md#push-notification--o-canal-que-torna-o-app-útil) — a porta em `core/notifications/`, o fornecedor em `android/`, e o estado "indisponível" que não é "negado" (2026-09-20) |

"Só Android" já está no **Não entra** do [README do plano](README.md#escopo). Segue pendente, e
**não** é documento de arquitetura: a imagem API 35 dita no
[README.md](../../../README.md#comandos) junto de [scripts/mobile.mjs](../../../scripts/mobile.mjs)
— e isso é a entrega de **B-34**, não trabalho de propagação.

**Tarefas que as decisões criaram, e que já estão nas fases e na matriz:** **B-30** (expiração do
pendente, F0, de D-11), **B-31** (reenvio e descarte do push token, F1, de D-13), **B-32** (estado
de notificação negada, F1, de D-14), **B-33** (estender o prazo no card, F3, de D-16) e **B-34**
(imagem de emulador fixada, F4, de D-09). [S-02](scenarios.md) também teve o texto corrigido por
causa de D-10 — sem o *"do mesmo usuário"*, ele passaria verde com a chave errada.

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura.
3. Rode `pnpm plan progress`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; o efeito dela no plano vai para o
  [progresso](progress.md).
