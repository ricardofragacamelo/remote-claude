# Plano 01 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

---

## Contrato WS — B-01…B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | `session.detach` é aceito e a connection para de receber a sessão | eq | integração | — | B-01 | ⬜ |
| S-02 | frame de comando com campo desconhecido é aceito (forward-compat) | eq | unit | — | B-04 | ⬜ |
| S-03 | `event` emitido sem `seq` é recusado pelo guard | err | unit | — | B-02 | ⬜ |
| S-04 | schema alterado sem regenerar o Dart → `contracts:check` falha | err | unit | — | B-04 | ⬜ |
| S-05 | `permission.resolve` com `decision: deny` e sem `reason` é recusado | err | unit | `INVALID_INPUT` | B-03 | ⬜ |
| S-06 | `v` maior que o suportado no handshake → fecha `4426` com `supportedVersions` | fron | integração | — | B-04 | ⬜ |
| S-07 | `contracts:generate` é idempotente — segunda execução não muda o gerado | idem | integração | — | B-04 | ⬜ |
| S-08 | comando inexistente → `error` no frame e o socket **permanece aberto** | err | integração | `INVALID_INPUT` | B-06 | ⬜ |
| S-85 | `diag.ping` responde `diag.pong` com o mesmo `nonce` | eq | integração | — | B-01 | ⬜ |
| S-86 | `session.ping`, o nome antigo, deixa de existir no contrato | err | integração | `INVALID_INPUT` | B-01 | ⬜ |
| S-87 | `permission.extend` sem `requestId` é recusado pelo schema | err | unit | `INVALID_INPUT` | B-01 | ⬜ |

## Workspace e allowlist — B-07…B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-09 | caminho dentro de uma raiz permitida é aceito | eq | unit | — | B-07 | ⬜ |
| S-10 | caminho fora da allowlist é negado | err | unit | `WORKSPACE_NOT_ALLOWED` | B-07 | ⬜ |
| S-11 | `..` que escapa a raiz depois de normalizar é negado | err | unit | `WORKSPACE_NOT_ALLOWED` | B-07 | ⬜ |
| S-12 | symlink dentro da raiz apontando para fora é negado | err | integração | `WORKSPACE_NOT_ALLOWED` | B-07 | ⬜ |
| S-13 | caminho relativo é recusado antes de qualquer I/O | err | unit | `INVALID_INPUT` | B-07 | ⬜ |
| S-14 | caminho existe mas é arquivo | err | integração | `WORKSPACE_NOT_A_DIRECTORY` | B-10 | ⬜ |
| S-15 | caminho inexistente dentro da raiz | err | integração | `WORKSPACE_NOT_FOUND` | B-10 | ⬜ |
| S-16 | caminho **exatamente igual** à raiz é aceito | fron | unit | — | B-07 | ⬜ |
| S-17 | prefixo textual da raiz sem ser filho (`/srv/projects-evil`) é negado | fron | unit | `WORKSPACE_NOT_ALLOWED` | B-07 | ⬜ |
| S-18 | allowlist vazia ou com caminho relativo impede o processo de subir | err | unit | — | B-08 | ⬜ |
| S-19 | `GET /workspaces` devolve só as raízes configuradas, sem varrer disco | eq | integração | — | B-10 | ⬜ |
| S-20 | registrar uso do mesmo workspace duas vezes não duplica linha | idem | integração | — | B-09 | ⬜ |

## Runtime da sessão e Agent SDK — B-12…B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-21 | `session.start` abre uma `query()` e emite `session.started` | eq | integração | — | B-17 | ⬜ |
| S-22 | prompt que chega durante um turno é **enfileirado** e roda em seguida | conc | integração | — | B-17 | ⬜ |
| S-23 | dois prompts simultâneos preservam a ordem de chegada | conc | integração | — | B-14 | ⬜ |
| S-24 | `stream_event` vira `message.delta` com `messageId` | eq | unit | — | B-15 | ⬜ |
| S-25 | `assistant` com `tool_use` vira `tool.started` | eq | unit | — | B-15 | ⬜ |
| S-26 | variante desconhecida de `SDKMessage` vira `warn` e **não** derruba a sessão | err | unit | — | B-15 | ⬜ |
| S-27 | `result` vira `turn.completed` com `usage`, custo e duração | eq | unit | — | B-15 | ⬜ |
| S-28 | `interrupt` em sessão `running` devolve a sessão para `idle` | est | integração | — | B-17 | ⬜ |
| S-29 | `interrupt` em sessão já fechada | est | unit | `SESSION_NOT_FOUND` | B-16 | ⬜ |
| S-30 | `query.close()` executa mesmo quando o `for await` lançou | err | integração | `CLAUDE_UNAVAILABLE` | B-14 | ⬜ |
| S-31 | abrir sessão acima do limite configurado | fron | unit | `SESSION_LIMIT_REACHED` | B-17 | ⬜ |
| S-32 | `seq` é monotônico por sessão e atribuído só no hub | eq | unit | — | B-18 | ⬜ |
| S-33 | `attach` com `resumeFromSeq` dentro do buffer replica só o que falta | eq | integração | — | B-18 | ⬜ |
| S-34 | `resumeFromSeq` abaixo do `oldestAvailableSeq` → `gap: true` | fron | integração | — | B-18 | ⬜ |
| S-35 | buffer no limite de 1000 descarta o mais antigo, e `oldestAvailableSeq` acompanha | fron | unit | — | B-18 | ⬜ |
| S-36 | connection lenta estoura a fila → fecha `1013` sem segurar o loop do SDK | conc | integração | — | B-18 | ⬜ |
| S-37 | `attach` repetido da mesma connection não duplica entrega | idem | integração | — | B-19 | ⬜ |
| S-38 | `session.close` por quem não é dono da sessão | err | integração | `FORBIDDEN` | B-19 | ⬜ |
| S-39 | `query()` sem `settingSources: ['project']` ou sem o hook → `scan:security` falha | err | unit | — | B-13 | ⬜ |
| S-88 | 11ª sessão com o teto em 10: recusada, traduzida e **sem subprocesso órfão** | fron | integração | `SESSION_LIMIT_REACHED` | B-17 | ⬜ |
| S-89 | fixture regravada do mesmo roteiro produz o mesmo arquivo | idem | integração | — | B-44 | ⬜ |
| S-90 | fixture gravada reproduz `6 tool calls → 6 hooks → 2 canUseTool` | eq | integração | — | B-44 | ⬜ |

## Auditoria — B-21…B-24, B-46, B-47

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-40 | 6 invocações de tool geram 6 registros — cobertura total, não só o que pede humano | eq | integração | — | B-23 | ⬜ |
| S-41 | tool auto-aprovada pelo CLI (sem `canUseTool`) também é registrada | eq | integração | — | B-23 | ⬜ |
| S-42 | registro carrega `who`, `what`, `when`, `where` e o `input` exato | eq | unit | — | B-21 | ⬜ |
| S-43 | `UPDATE` na tabela de auditoria é recusado pelo banco | err | integração | — | B-22 | ⬜ |
| S-44 | `DELETE` na tabela de auditoria é recusado pelo banco | err | integração | — | B-22 | ⬜ |
| S-45 | falha de escrita da auditoria **bloqueia** a autorização | err | integração | `INTERNAL_ERROR` | B-24 | ⬜ |
| S-46 | o hook devolve `continue: true` mesmo para tool que será negada | est | unit | — | B-23 | ⬜ |
| S-47 | mesmo `toolUseId` reentregue não duplica registro | idem | integração | — | B-23 | ⬜ |
| S-48 | duas tools concorrentes geram dois registros, sem sobrescrita | conc | integração | — | B-22 | ⬜ |
| S-49 | `input` acima do limite de truncamento vai **inteiro** para a trilha, truncado só no log | fron | unit | — | B-21 | ⬜ |
| S-99 | `Write` aprovado grava caminho, hash e mtime do resultado | eq | integração | — | B-46 | ⬜ |
| S-100 | duas escritas no mesmo arquivo deixam **uma** linha, com o estado mais recente | idem | integração | — | B-46 | ⬜ |
| S-101 | tool que **falhou** não atualiza o estado do arquivo | err | integração | — | B-46 | ⬜ |
| S-102 | falha ao gravar o estado **não** bloqueia a autorização — ao contrário da trilha | err | integração | — | B-46 | ⬜ |
| S-103 | o estado do arquivo não vai para a tabela de auditoria, que segue recusando `UPDATE` | err | integração | — | B-46 | ⬜ |
| S-104 | o primeiro toque do turno num caminho guarda o conteúdo anterior; o segundo **não** sobrescreve o snapshot | idem | integração | — | B-47 | ⬜ |
| S-105 | arquivo criado pelo turno é registrado como "ausente antes", para poder ser apagado no desfazer | est | integração | — | B-47 | ⬜ |
| S-106 | dois turnos que tocam o mesmo arquivo geram dois checkpoints, um por `prompt_id` | eq | integração | — | B-47 | ⬜ |
| S-107 | a purga respeita o teto e **não** apaga snapshot que uma sessão viva ainda alcança | fron | integração | — | B-47 | ⬜ |
| S-108 | arquivo acima do limite não é snapshotado, e fica registrado como não garantido | fron | integração | — | B-47 | ⬜ |

## Permissão — B-25…B-31

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-50 | permissão aprovada dentro do prazo destrava o loop do agente | eq | integração | — | B-27 | ⬜ |
| S-51 | ninguém responde até `expiresAt` → negado automaticamente | fron | integração | `PERMISSION_REQUEST_EXPIRED` | B-27 | ⬜ |
| S-52 | resposta que chega depois do timeout é `ack` sem efeito | conc | integração | — | B-29 | ⬜ |
| S-53 | mesmo `requestId` resolvido duas vezes → **uma** execução | idem | unit | — | B-27 | ⬜ |
| S-54 | duas connections resolvem juntas → vence a primeira, a segunda vê `resolvedBy` real | conc | e2e | — | B-29 | ⬜ |
| S-55 | `deny` sem `reason` | err | unit | `INVALID_INPUT` | B-25 | ⬜ |
| S-56 | resolve de `requestId` inexistente | err | unit | `PERMISSION_REQUEST_NOT_FOUND` | B-29 | ⬜ |
| S-57 | resolve vindo de connection não anexada à sessão | err | integração | `PERMISSION_NOT_OWNED` | B-29 | ⬜ |
| S-58 | sessão morre com pedido pendente → `options.signal` cancela e o request encerra | est | integração | — | B-27 | ⬜ |
| S-59 | reconexão republica os pendentes do **nosso** registro, sem `reinitialize()` | est | integração | — | B-28 | ⬜ |
| S-60 | regra de escopo `session` auto-resolve o pedido seguinte sem notificar ninguém | eq | integração | — | B-25 | ⬜ |
| S-61 | escopo `once` **não** afeta o pedido seguinte | fron | unit | — | B-25 | ⬜ |
| S-62 | `riskHint: destructive` é derivado no backend para comando destrutivo | eq | unit | — | B-30 | ⬜ |
| S-63 | timeout com `defaultToNo` ausente continua negando — silêncio nunca autoriza | err | unit | `PERMISSION_REQUEST_EXPIRED` | B-27 | ⬜ |
| S-64 | `permission.resolved` chega a todas as connections, inclusive quem respondeu | eq | integração | — | B-29 | ⬜ |
| S-65 | a decisão vira registro de auditoria com `resolvedBy` e o `input` exato | eq | integração | — | B-31 | ⬜ |
| S-91 | `permission.extend` adia o `expiresAt` e o pedido sobrevive ao prazo original | est | integração | — | B-27 | ⬜ |
| S-92 | teto de extensões atingido → erro, e `remainingExtensions` chega a zero | fron | integração | `INVALID_INPUT` | B-27 | ⬜ |
| S-93 | estender pedido já resolvido é **erro**, não no-op silencioso | err | integração | `PERMISSION_REQUEST_NOT_FOUND` | B-29 | ⬜ |
| S-94 | web e celular estendem o mesmo pedido juntos → uma extensão, não duas | conc | integração | — | B-29 | ⬜ |
| S-95 | comando que a heurística **não reconhece** vira `destructive`, não seguro | fron | unit | — | B-30 | ⬜ |

## Web da sessão — B-32…B-38

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-66 | evento com `seq <= lastSeq` é descartado — replay não duplica mensagem | idem | unit | — | B-32 | ⬜ |
| S-67 | `gap: true` limpa o store e recarrega o transcript por HTTP | est | unit | — | B-32 | ⬜ |
| S-68 | `message.delta` acumula por `messageId`; `message.completed` substitui o acumulado | eq | unit | — | B-32 | ⬜ |
| S-69 | duas mensagens em voo não misturam texto | conc | unit | — | B-32 | ⬜ |
| S-70 | card de permissão em `pending` não aceita segundo clique | est | integração | — | B-36 | ⬜ |
| S-71 | contagem regressiva chega a zero → card sai como negado, sem confirmação | fron | integração | `PERMISSION_REQUEST_EXPIRED` | B-36 | ⬜ |
| S-72 | permissão resolvida em outro dispositivo some da fila sozinha | conc | integração | — | B-36 | ⬜ |
| S-73 | reconexão usa backoff com jitter e nunca entra em laço apertado | fron | unit | — | B-33 | ⬜ |
| S-74 | literal apresentável nas telas novas → `lint` e `i18n:check` falham | err | unit | — | B-38 | ⬜ |
| S-75 | componente novo chamando service ou `api.ts` direto → `lint:arch` falha | err | unit | — | B-34 | ⬜ |
| S-96 | sessão encerrada com buffer vivo: estado terminal + replay **rotulado como parcial** | est | integração | — | B-34 | ⬜ |
| S-97 | sessão encerrada com buffer perdido: só o estado terminal, e a tela diz isso | fron | integração | — | B-34 | ⬜ |

## E2E e smoke-live — B-39…B-43

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-76 | autenticar → listar workspaces → abrir sessão → prompt → resposta completa | eq | e2e | — | B-40 | ⬜ |
| S-77 | permissão pelo web: Claude pede, usuário aprova, a tool executa | eq | e2e | — | B-40 | ⬜ |
| S-78 | ninguém responde → `deny` automático e a sessão continua coerente | fron | e2e | `PERMISSION_REQUEST_EXPIRED` | B-40 | ⬜ |
| S-79 | socket cai no meio do turno → reconecta com replay, nada perdido nem duplicado | conc | e2e | — | B-40 | ⬜ |
| S-80 | fora tempo suficiente para estourar o ring buffer → `gap: true` e recarga | est | e2e | — | B-40 | ⬜ |
| S-81 | tool longa em execução → `session.interrupt` → sessão volta a `idle` | est | e2e | — | B-40 | ⬜ |
| S-82 | abrir workspace fora da allowlist pela porta do usuário | err | e2e | `WORKSPACE_NOT_ALLOWED` | B-40 | ⬜ |
| S-83 | `smoke-live`: sessão real responde e **nenhum** `SDKMessage` cai no ramo desconhecido | eq | e2e | — | B-41 | ⬜ |
| S-84 | o `integration_test` do app segue verde com o contrato novo, sem `INVALID_INPUT` | idem | e2e | — | B-43 | ⬜ |
| S-98 | diretório marcado como confiado: o backend limpa a marca e o `canUseTool` continua sendo chamado | err | e2e | — | B-42 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Contrato WS (B-01…B-06) | `est` | schema não tem estado: ele descreve o frame, e a máquina de estados que o usa é do módulo `session` (S-28, S-29) |
| Contrato WS (B-01…B-06) | `conc` | a geração é offline e tem um único emissor; concorrência do contrato **em uso** está em S-22, S-23 e S-54 |
| Workspace (B-07…B-11) | `est` | a regra é pura e sem ciclo de vida — um caminho é permitido ou não, e não transita entre estados |
| Workspace (B-07…B-11) | `conc` | validação sem estado compartilhado: duas validações simultâneas não se enxergam. O único estado é o metadado de uso, coberto por S-20 |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
