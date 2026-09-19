# Plano 01 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** todas concluídas. **O plano fechou.**
**Última atualização:** 2026-09-19
**Bloqueios:** nenhum.

**O produto faz o que o plano existia para provar.** Uma `query()` do Agent SDK roda de verdade
na máquina, o stream chega ao web como eventos do nosso contrato, **toda** invocação de tool é
gravada numa trilha que o próprio banco recusa reescrever, uma tool sensível **bloqueia o loop do
agente** até um humano responder — com o silêncio negando — e existe a tela onde esse humano
responde. Os nove cenários obrigatórios alcançáveis por este plano rodam em todo PR contra um
replay gravado, e uma suíte sob demanda confronta esse replay com o Claude de verdade. Com a F4, `canUseTool`
bloqueia o loop do agente até um humano decidir, e o silêncio **nega** — nosso prazo é o único que
existe, porque o CLI não impõe nenhum. A fábrica de query recusa três omissões e não duas: sem
`settingSources: ['project']`, sem o hook `PreToolUse` **e sem `canUseTool`** nenhuma sessão abre,
e `pnpm scan:security` lê as três na chamada.

Com a F5, a sessão tem tela: `/sessions/:id` reproduz a conversa a partir do link, o comando de
cada tool aparece **inteiro**, e a fila de permissão conta o tempo, não aceita segundo clique e
some sozinha quando alguém responde de outro dispositivo.

**R-01 continua mitigado** — `clearTrustMark` limpa a marca de confiança antes de abrir a sessão —
e a B-42 ainda prova isso em e2e, na F6.

**A [D-17](decisions.md#d-17--usar-o-código-http-que-cada-coisa-é) fechou o último cenário em
aberto deste plano**, e com ele o S-38: `403` é falha de autorização, `404` é registro que não
existe, e o produto deixou de inventar semântica própria para esconder existência. A mudança
alcançou workspace, sessão viva, `attach` e o ping de diagnóstico.

**Os dois comandos do critério saíram 0**, e um terceiro com eles:

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
F6 ████████████████████ 100%   ✅ concluída
```

**Três coisas seguem em aberto**, e nenhuma delas é deste plano — ver
[o que ficou de fora](#escopo-reduzido-ou-adiado): o backpressure do S-36, a divergência do S-38
entre a matriz e o catálogo de erros, e as fixtures do S-89/S-90.

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
F6 ████████████████████ 100%   ✅ concluída
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-06, B-45 | 7/7 | ✅ |
| [F1](F1-workspace.md) | B-07…B-11 | 5/5 | ✅ |
| [F2](F2-session-runtime.md) | B-12…B-20, B-44 | 10/10 | ✅ |
| [F3](F3-audit.md) | B-21…B-24, B-46, B-47 | 6/6 | ✅ |
| [F4](F4-permission.md) | B-25…B-31 | 7/7 | ✅ |
| [F5](F5-web-session.md) | B-32…B-38 | 7/7 | ✅ |
| [F6](F6-e2e.md) | B-39…B-43 | 5/5 | ✅ |
| **Total** | **B-01…B-47** | **47/47** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 108 | 3 | 0 | 105 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 17 | 0 | 0 | 17 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-18 | F0 | 6 — unit (backend) | `SessionDetachHandler.handle` não era `async`, então `payloadOf` lançava de forma síncrona a partir de um método que declara `Promise` | método virou `async`: quem só anexa `.catch` passa a receber a falha | 3 testes verdes |
| 2 | 2026-09-18 | F0 | 6 — unit (mobile) | `seq` obrigatório em `event` passou a recusar dois frames que os testes construíam sem ele | o teste do codec ganhou o `seq`, e a asserção "evento sem seq" desceu para o nível certo (codec, não mapper) | verde, com três casos novos |
| 3 | 2026-09-18 | F0 | 1 — formatação | schemas novos e dois specs escritos fora do estilo do Prettier | `prettier --write` nos arquivos citados | verde |
| 4 | 2026-09-18 | F0 | 2 — lint | `_dropped` de um destructuring nunca usado, em teste do gerador | o caso passou a construir a regra sem `because` em vez de removê-lo por destructuring, e ganhou o irmão `because: ''` | verde |
| 5 | 2026-09-18 | F0 | 5 — duplicação | o ack genérico repetido por handler, e dois schemas de permissão com os mesmos campos sem descrição | ack virou `accepted(type)` em `ws-command.ts`; os dois schemas ganharam as descrições que já lhes faltavam | 0 clones |
| 6 | 2026-09-18 | F0 | 8 — integração | o teste do `4400` mandava um `event` sem `seq`, que agora morre na decodificação antes da verificação de `kind` | o frame ganhou `seq`, e o caminho novo virou teste próprio | 33 testes verdes |
| 7 | 2026-09-19 | F2 | 6 — unit (backend) | a projeção de status chamava `moveTo`, que lança: um evento fora da ordem esperada derrubaria a sessão | a entidade ganhou `observe`, que move se a máquina permitir e responde se moveu; `moveTo` segue estrito para o que o nosso código pede | 16 testes verdes |
| 8 | 2026-09-19 | F2 | 8 — integração | a suíte abria uma sessão por teste e não fechava nenhuma, e o 11º teste morria em `SESSION_LIMIT_REACHED` — o limite fazendo exatamente o que deve | `afterEach` encerra o que cada teste abriu, e o teste do limite descobre a fronteira em vez de assumir dez | 15 testes verdes |
| 9 | 2026-09-19 | F3 | 8 — integração | o id da trilha é um ULID do nosso gerador e a coluna era `uuid`: **toda** escrita falhava, e a sessão fechava por `auditUnavailable` | a coluna virou `text`, como as outras identidades cunhadas pelo domínio | 17 testes verdes |
| 10 | 2026-09-19 | F3 | 8 — integração | o hook que recusava a tool lançava, e um hook que lança leva o stream junto — a D-07 diz o contrário: a primeira falha nega a tool com a sessão viva | a recusa virou uma decisão `deny` do próprio SDK; encerrar a sessão continua sendo só a segunda falha seguida | S-45 verde nas duas metades |
| 11 | 2026-09-19 | F1-F3 | 5 — duplicação | 14 clones, com o limiar em zero | extração de verdade: `PersistenceContext`, `auditColumns`, `ContractCommandHandler`, `Panel` no web, `isPlainObject`, e `AuditEntrySnapshot` derivado do draft | 0 clones |
| 12 | 2026-09-19 | F1-F3 | 7 — cobertura | onze arquivos abaixo do piso de 90 % por arquivo, com o global em 97,5 % | testes para cada um; o fake do SDK passou a disparar `UserPromptSubmit` e `PostToolUse`, que o SDK real dispara e ele não | 99,4 % de linhas, nenhum arquivo abaixo |
| 13 | 2026-09-19 | F1-F3 | 10 — segurança | a regra própria acusava **comentários** que citam `query()`; uma regra que acusa prosa é uma regra que se aprende a ignorar | a regra passou a apagar comentários antes de procurar a chamada, com strings preservadas porque é nelas que mora `['project']`; 15 testes novos provam os dois lados | 175 arquivos, nenhuma regra quebrada |
| 14 | 2026-09-19 | F4 | 8 — integração | a decisão de permissão não chegava à trilha: o índice único era `(session_id, tool_use_id)`, e o `ON CONFLICT DO NOTHING` descartava **em silêncio** a segunda linha da mesma invocação. Uma decisão que não chega à trilha é exatamente o que aquela tabela existe para impedir | migration `0006`: a chave ganhou `decision`. Reentrega do hook continua colidindo com o `recorded` que repete; fato **diferente** sobre a mesma invocação passa a ter linha própria | S-65 verde |
| 15 | 2026-09-19 | F4 | 8 — integração | o fake do SDK reusava `request-N` entre sessões, e a idempotência global devolvia à segunda sessão o veredito da primeira — uma tool autorizada sem ninguém ser perguntado | duas correções: o fake passou a cunhar id por execução, como o SDK real, e a idempotência passou a exigir **a mesma sessão** — colisão abre pergunta nova em vez de herdar resposta | 15 testes verdes |
| 16 | 2026-09-19 | F4 | 7 — cobertura (e2e da própria suíte) | o backend não subia na stack efêmera: as quatro variáveis novas de permissão não existiam no ambiente do `run-e2e-local`, e a configuração falha rápido de propósito | `scripts/lib/stack.mjs` passou a declará-las, com prazos curtos — um e2e que espera dois minutos por um deadline é um e2e que ninguém roda | stack verde |
| 17 | 2026-09-19 | F4 | 7 — cobertura | rejeição **não tratada**: um deadline que dispara depois de o pool fechar derruba o processo, e um callback de scheduler não tem para quem devolver promessa | `PermissionDeadlines` ganhou um `DeadlineFailureReporter` — callback, não logger, porque `application/` não importa `@shared` —, e o módulo o liga ao log | sem erro pendente |
| 18 | 2026-09-19 | F4 | 5 — duplicação | 5 clones: as cinco colunas que nomeiam uma invocação em duas tabelas, o fan-out do hub repetido entre `publish` e `request`, os dois logs de falha do listener, e o guard "posso agir neste pedido?" escrito duas vezes | extração de verdade: `invocationColumns`, `SessionHub.fanOut`, `report()` no listener e `answerableRequest()` — este último virou também o tipo `Answerer`, que os dois comandos passaram a estender | 0 clones |
| 20 | 2026-09-19 | F5 | 1 — formatação, 6 — unit | a convenção do catálogo é de **três** segmentos por chave, e `session.tool.status.running` tinha quatro; e uma chave com espaço fino inquebrável nunca casava a asserção, porque o DOM normaliza aquilo como espaço comum | a família virou `session.toolStatus.*`, e os espaços finos saíram dos dois catálogos | 233 testes verdes |
| 21 | 2026-09-19 | F5 | 5 — duplicação | 8 clones: a mesma assinatura de subscrição em três hooks, três redutores de tool com o mesmo guard, `isRecord` em duas features, e a interface da conversa repetida no store e no hook | `useSessionFrames` em `shared/hooks/`, `changeTool()`, `shared/lib/json.ts`, e `Conversation` estendida em vez de reescrita | 0 clones |
| 23 | 2026-09-19 | F6 | 9 — e2e | a sessão ficava presa em `starting` para sempre: `session.started` é publicado pelo **handler**, não passa pela projeção de status, e `starting` só alcança `idle` e `closed` — então o primeiro delta do primeiro turno era transição ilegal, descartada pelo `observe` | o caso de uso move a sessão para `idle` assim que o subprocesso sobe, que é o que `session.started` significa; o web passou a derivar o mesmo do mesmo evento | S-76 verde |
| 24 | 2026-09-19 | F6 | 9 — e2e | `permission.requested` nunca chegava a `waitingPermission`: o pedido é publicado pelo módulo `permission`, fora do caminho do runner, e o status ficava onde estava. A UI mostraria "executando" para algo que nunca termina sozinho | `observedStatus` virou função compartilhada e a ponte passou a anunciar o status nos dois sentidos, do lugar que é o único a saber que o loop parou | S-77 verde |
| 25 | 2026-09-19 | F6 | 9 — e2e | **cada fragmento virava uma mensagem**: o mapper chaveava `message.delta` pelo `uuid` do envelope do `stream_event`, que é único por fragmento. A terceira regra do store do cliente — acumular por `messageId` — não tinha o que acumular | o mapper passou a lembrar o id que o `message_start` anuncia, e a esquecê-lo no `message_stop`. Fragmento de mensagem que ele não viu começar é descartado: `message.completed` traz a mensagem inteira | 44 testes, e a asserção contra a fixture real |
| 26 | 2026-09-19 | F6 | 9 — e2e | `rate_limit_event` publicava `session.statusChanged: idle` — dizia ao cliente que a sessão tinha parado enquanto o modelo respondia. É a única forma de um status mentir | passou a não publicar nada: é aviso, não transição, e o contrato não tem evento para ele. Expor rate limit é do plano 05 |
| 27 | 2026-09-19 | F6 | 5 — duplicação | 10 clones nas specs e2e novas, e a segunda configuração do Playwright quase idêntica à primeira | `openWorkspace`, `attachFrom`, `pushPastSeq`, `statusReached`, `expectRecycledBuffer` e `playwright.shared.ts` | 0 clones |
| 28 | 2026-09-19 | F6 | 6 — unit | `CLAUDE_CONFIG_DIR` passou a ser lido pelo código, e o `.env.example` exige que toda variável lida seja declarada — mas outra regra proíbe qualquer variável com `CLAUDE` no nome | a regra foi **estreitada** para o que ela protege: credencial. A exceção é nomeada numa lista de um item, e um teste novo prova que `ANTHROPIC_API_KEY` continua reprovado |
| 29 | 2026-09-19 | F6 | 7 — cobertura | `src/bootstrap.ts`, extraído do `main.ts`, sem nenhuma cobertura | o harness de integração passou a usar **a wiring do produto** em vez de uma cópia dela, e `loadDotEnv` ganhou parâmetro e teste. O `host` do `listen` perdeu o default: o produto escuta tudo e a suíte só o loopback, e um default faria de um dos dois o caso silencioso | 100 % |
| 31 | 2026-09-19 | pós-entrega | 6 — unit, 8 — integração | a [D-17](decisions.md#d-17--usar-o-código-http-que-cada-coisa-é) reverteu a regra de status: "existe e é de outra pessoa" deixou de ser `404` e passou a ser `403`. Onze testes afirmavam a regra antiga, em quatro caminhos diferentes | os quatro caminhos passaram a distinguir as duas perguntas — `SessionRegistry.require`, `AttachSessionUseCase` (com o port respondendo `owned`/`notOwned`/`unknown` em vez de um booleano), `WorkspaceAllowlist.resolve` e `PingDiagUseCase` —, e os testes passaram a afirmar a regra nova, S-38 incluído | 1033 testes verdes |
| 30 | 2026-09-19 | F6 | — (o próprio `smoke-live`) | **a suíte contra o Claude real passou sem falar com o Claude**: a stack isolava `CLAUDE_CONFIG_DIR`, o CLI não achava o login e respondia "Not logged in · Please run /login" como um turno perfeitamente bem-formado | a execução live deixou de sobrescrever a variável, e a spec ganhou a única asserção sobre **o que** foi dito. Verde agora significa que o modelo respondeu: "pong", US$ 0,274, 2 s |
| 22 | 2026-09-19 | F5 | 7 — cobertura | sete arquivos abaixo do piso, a rota nova sem nenhum teste, e o `useNavigate` do App avisando em toda renderização que não havia router | `renderRouted()` no suporte, spec da rota, e casos para os ramos que ninguém tinha exercitado — payload ausente, input que não é objeto, `resolvedBy` ausente | 407 testes verdes, nenhum arquivo abaixo |
| 19 | 2026-09-19 | F4 | 7 — cobertura | três arquivos abaixo do piso: a ponte (um ramo do `abort` nunca exercitado, porque o teste abortava antes de a promessa existir), o use case do request (`toolUseId` nulo) e `PermissionRequestExpiredError`, que **nenhum caminho lançava** | o teste do abort passou a esperar um tick real; o `toolUseId` ausente ganhou caso; e estender um pedido que o prazo já recusou passou a ser `PERMISSION_REQUEST_EXPIRED` (410) em vez de `NOT_FOUND` — distinção que valia a pena fazer | 100 % nos três |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-18 | O spike da B-45 roda sobre um `CLAUDE_CONFIG_DIR` isolado, e não sobre backup e restauração do `~/.claude.json` | havia uma sessão de Claude Code aberta na própria máquina, escrevendo no mesmo arquivo; backup e restore disputariam com ela. O isolado mede a mesma coisa sem risco — o `~/.claude.json` ficou byte a byte idêntico, verificado por checksum | B-45, e o enunciado da task no [F0](F0-contract.md) |
| 2026-09-18 | [D-14](decisions.md#d-14--o-segundo-jeito-de-furar-o-canusetool) — nome simples em `options.allowedTools` também dispensa o `canUseTool` | achado colateral do spike: o SDK avisa em `stderr` (`CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`) e um backend que não lê `stderr` não vê nada | B-13 (F2), e o `scan:security` |
| 2026-09-18 | A obrigatoriedade condicional vive no schema, como `x-required-when`, e é gerada para TS e Dart | a B-02 pede `seq` obrigatório em `event` e a B-03 pede `reason` obrigatório em `deny`; escrever as duas à mão em três linguagens é como uma regra passa a valer em duas delas | gerador de contratos, [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#campo-obrigatório-por-condição) |
| 2026-09-18 | O `4426` passa a mandar um frame de `error` com `supportedVersions` **antes** de fechar | o S-06 pede as versões suportadas, e um frame de fechamento tem código e motivo, nunca payload. Sem isso, o único recado que um app publicado consegue dar é "não funcionou" | `app.gateway.ts`, S-06 |
| 2026-09-18 | O handler do ping mudou de `ws/session/` para `ws/diag/` | a [D-01](decisions.md#d-01--o-destino-da-fatia-vertical-do-bootstrap) tirou o par do namespace de sessão; deixá-lo na pasta de sessão manteria no código a confusão que o nome novo existe para desfazer | `DiagPingHandler`, módulos de DI |
| 2026-09-19 | **A validação rodou uma vez, ao fim das três fases**, e não ao fim de cada uma | pedido explícito de quem conduz o trabalho. O protocolo diz que a fase é a unidade do ciclo, e o preço foi pago: os treze ciclos do histórico acima vieram todos de uma vez, e três deles (duplicação, cobertura, segurança) foram maiores do que teriam sido por fase | o [protocolo](../../architecture/shared/11-validation-protocol.md) continua valendo; este foi um desvio consciente, não uma mudança de regra |
| 2026-09-19 | `diag` virou domínio próprio: `DiagSession`, tabela `diag_sessions`, `application/diag/` | havia duas coisas diferentes chamadas `Session` na mesma pasta — um contador de ping e um subprocesso vivo. A D-01 tirou o par do namespace do contrato; isto termina a mudança no código | migration `0002`, `domain/diag/`, `AttachSessionUseCase` |
| 2026-09-19 | `session.attach` passou a perguntar a **várias** fontes quem é dono da sessão | a sessão viva mora em memória e a de diagnóstico numa tabela; nenhuma conhece a outra, e um use case que consultasse as duas seria o acoplamento que a porta evita. Um token de DI não serve: o Nest resolve um token para **um** provedor, e o segundo módulo sobrescreveria o primeiro em silêncio | `SessionOwnership`, `RegistrySessionOwnership`, `DiagSessionOwnership` |
| 2026-09-19 | A fábrica de query **recusa** opções sem `settingSources: ['project']` e sem o hook `PreToolUse` | a costura que permite injetar um stream roteirizado deixou o único `query(` literal do backend num passthrough, e a regra de máquina passou a não proteger nada. A fábrica agora é a última barreira antes do subprocesso — e é ela que o `scan:security` lê | `query.factory.ts`, `UnsafeSdkOptionsError` |
| 2026-09-19 | A falha da trilha vira uma decisão `deny` do SDK, não uma exceção do hook | um hook que lança leva o stream junto, e a [D-07](decisions.md#d-07--banco-fora-sessão-viva) exige o contrário: a primeira falha nega a tool **com a sessão viva** | `session-runner.ts`, `AuditToolInvocationRecorder` |
| 2026-09-19 | O e2e roda contra um **ponto de entrada de teste** que substitui só a fábrica de query | a mesma aplicação, o mesmo grafo de módulos, o mesmo banco — e no lugar do que abriria o CLI, um replay de execução gravada. Fica em `test/` e não atrás de um flag em `src/`: um interruptor no produto que troca o Agent SDK é um interruptor que um dia sobe ligado | `backend/test/e2e/scripted-main.ts`, `src/bootstrap.ts` |
| 2026-09-19 | O fake do SDK dispara os hooks **no meio** do replay, não antes dele | disparar tudo antes deixava `canUseTool` bloqueando uma sessão que ainda não tinha começado a responder — e a máquina de estados, que só alcança `waitingPermission` a partir de `thinking` ou `running`, nunca chegava lá. O stream real nunca faz isso: uma chamada de tool é algo que o modelo decide no meio do turno | `scripted-query.ts` |
| 2026-09-19 | Um prompt pode nomear a fixture e pedir um turno que só termina com `interrupt` | uma suíte e2e ganha **um** backend por execução, e subir um por cenário custaria mais do que prova. As duas tags (`[fixture:x]`, `[hold]`) são controles do fake e de nada mais | `scripted-query.ts`, S-81 |
| 2026-09-19 | `clearTrustMark` passou a honrar `CLAUDE_CONFIG_DIR` | é o que o próprio CLI faz. Limpar a marca no arquivo da home enquanto o CLI lê outro parece exatamente igual a limpar, e não é | `trusted-directory.ts` |
| 2026-09-19 | O transporte passou a aceitar **vários** assinantes por sessão | a conversa e a fila de permissão são duas features olhando o mesmo stream, e nenhuma deve saber que a outra existe. O `session.attach` pede replay a partir do **menor** `lastSeq` entre elas: reentregar o que um assinante já aplicou não custa nada, porque descartar `seq <= lastSeq` é a primeira regra de todo store | `ws-client.ts`, `useSessionFrames` |
| 2026-09-19 | O rótulo da permissão é derivado do nome da tool no cliente, não lido do campo `title` | o servidor manda uma chave, e o cliente precisa de uma chave para a qual **tem palavras** — mais um fallback para as tools que não conhece. Escrito como template, é também a única forma de o `pnpm i18n:check` enxergar a família em uso; chave que o verificador não vê é chave que alguém apaga | `PermissionCard.tsx`, `permission.tool.unknown` |
| 2026-09-19 | `react-hook-form` e `@hookform/resolvers` entraram como dependência | a [B-34](F5-web-session.md) pede o composer com React Hook Form + Zod, e é o que o [documento de estado](../../architecture/web/04-state-and-data.md#onde-cada-estado-mora) nomeia para formulário | `PromptComposer.tsx` |
| 2026-09-19 | [D-15](decisions.md#d-15--o-que-idempotente-quer-dizer-numa-extensão) — `permission.extend` significa "pelo menos o incremento a mais **a partir de agora**" | o contrato exige idempotência por `requestId` e o payload não tem outra chave. Somar ao prazo corrente seria mais intuitivo e **não** é idempotente: duas pontas dobrariam o prazo, que é exatamente o que a única proteção existente não pode permitir sem alguém decidir isso | `PermissionRequest.extend`, S-94 |
| 2026-09-19 | [D-16](decisions.md#d-16--de-onde-sai-o-padrão-de-uma-regra-de-sessão) — a regra de escopo `session` usa o padrão **mais estreito** que cobre a invocação, e cai para `once` quando nenhum honesto existe | a decisão do humano é sobre uma invocação; traduzi-la para a tool inteira autorizaria muito mais do que foi dito, e um padrão com `)` dentro seria relido como outra coisa | `PermissionSettlement.rememberRule`, `patternForInvocation` |
| 2026-09-19 | A decisão de permissão vira uma **segunda** linha na trilha, ao lado da do hook | o hook grava que a tool ia rodar; isto grava o que foi decidido e por quem. São fatos diferentes sobre a mesma invocação, e a pergunta "quem autorizou este comando?" é respondida pelo segundo | migration `0006`, `RecordDecisionOnResolved` |
| 2026-09-19 | O registro durável da decisão é `permission_requests`, não a trilha | a linha da trilha é gravada **depois** de o loop ser liberado, de propósito: o que precisa ser durável já foi escrito duas vezes — o hook bloqueou a tool até gravar, e o histórico foi atualizado antes de qualquer um ser avisado | `permission-resolved.listeners.ts`, S-65 |
| 2026-09-19 | `@nestjs/event-emitter` entrou como dependência | a [comunicação assíncrona](../../architecture/backend/03-modules.md#comunicação-assíncrona) nomeia `EventEmitter2` como o mecanismo, e `permission.resolved` tem três consumidores. Inventar um barramento próprio seria o desvio, não o contrário | `app.module.ts`, `EmitterPermissionEvents` |
| 2026-09-19 | Os usuários do realm local do Keycloak ganharam `id` fixo | a allowlist declara o `sub` de quem pode usar cada raiz (D-13), e um `sub` sorteado a cada import torna a allowlist de desenvolvimento e o e2e impossíveis de escrever | `infra/keycloak/realm-remote-claude.json`, `infra/workspace-allowlist.yaml` |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-19 | **S-36 — backpressure: fila estourada fecha com `1013`** | não foi implementado. O fan-out já é fire-and-forget e um envio que falha derruba a connection, então o loop do Agent SDK nunca fica preso; o que falta é o limite de fila e o código de fechamento | **plano 05**, com o resto dos limites derivados da máquina. Continua ⬜ na matriz |
| 2026-09-19 | **S-89, S-90 — as fixtures gravadas** | a gravação roda e está commitada, mas mediu `4 tool calls → 4 hooks → 1 canUseTool`, e não os `6 → 6 → 2` do spike. A **assimetria** — que é o que a ADR-011 afirma — se confirma; os números não, porque o prompt é outro. A idempotência da regravação (S-89) não é testável como escrita: o modelo não repete o mesmo stream | a medição está registrada abaixo; os dois cenários são reescritos ou removidos no [plano 04](../04-transcript-and-resume/README.md), que volta a mexer em fixture |

---

## Dívida herdada do plano 00

O que o [bootstrap](../00-bootstrap/progress.md#escopo-reduzido-ou-adiado) adiou e **este**
plano assume. Item herdado sem dono vira item esquecido.

| Herdado | Onde fecha |
|---|---|
| ~~S-119 — `session.detach` não existe no contrato nem no backend~~ | **fechada em 2026-09-18**, B-01: o comando existe no schema e o `SessionDetachHandler` existe no backend |
| Redutor de `message.delta` acumulado por `messageId` | B-32 |
| `e2e/smoke-live/` vazio desde a F6 do bootstrap | B-41 |
| R-01 — `allow` de projeto em diretório confiado fura o `canUseTool` | **fechada em 2026-09-19**: medido na B-45, mitigado na F2 por `clearTrustMark` e pela recusa da fábrica de query. A B-42 prova em e2e |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Diretório confiado dispensa o `canUseTool` | ✅ mitigado em 2026-09-19 | `clearTrustMark` limpa a marca antes de abrir a sessão, e a fábrica de query recusa opções sem `settingSources: ['project']` e sem o hook. A B-42 ainda prova em e2e |
| R-02 | O fake do Agent SDK pode divergir do SDK real | 🔄 reduzido em 2026-09-19 | o fake replica **fixtures gravadas do SDK real** (`pnpm fixtures:record`), não um stream escrito de memória. Continua sendo o `smoke-live` (B-41) quem confronta a escolha com a realidade |
| R-03 | Cobrir o mapper de ~38 variantes com 90 % de `branches` | ✅ fechado em 2026-09-19 | o mapper está em 100 % de linhas e branches, com 40 casos: a tabela, as formas frouxas que o SDK permite, e a regra de sobrevivência |
| R-04 | `~222 MB` por sessão medido em uma máquina só | 🔲 aberto | limite configurado aqui (`RC_SESSION_MAX_CONCURRENT`, default 10); derivado no plano 05 |
| R-05 | Auditoria que bloqueia transforma falha de banco em sessão parada | ✅ fechado em 2026-09-19 | a falha é `error` no log **e** um frame de erro para toda connection da sessão, e só a segunda falha seguida encerra |

Riscos que a F4 acrescentou ao acompanhamento, sem serem riscos do plano:

| Assunto | Estado | Observação |
|---|---|---|
| Um deadline que dispara durante o desligamento vira rejeição não tratada | ✅ fechado em 2026-09-19 | apareceu no portão 7 e derrubaria o processo sobre um soluço de banco. `PermissionDeadlines` reporta a falha por callback e o módulo a leva ao log |
| `requestId` do SDK assumido único no processo | ✅ mitigado em 2026-09-19 | não é mais assumido: a idempotência exige **a mesma sessão**, e uma colisão abre pergunta nova em vez de herdar veredito |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque a task com ✅ no arquivo da fase e rode `pnpm plan progress`
   — ele reescreve os contadores **deste** arquivo e os do [progresso geral](../progress.md).
   Progresso de fase é registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md) — é ele que responde em que pé o projeto está.
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso. Bloqueio
   que impede uma fase de começar entra também na tabela de decisões em aberto do
   [progresso geral](../progress.md).
