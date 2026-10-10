# F1 — Backend da trilha

Plano: [14 — Auditoria explicada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md), e das decisões D-01…D-08.
**Entrega:** a trilha passa a gravar o que aconteceu com cada invocação e onde ela nasceu, e a
responder a perguntas de gente — "o que rodou nesta pasta hoje, e como terminou?" — em vez de devolver
linhas soltas.

---

## Por quê nesta ordem

A migration vem primeiro porque tudo o mais escreve ou lê as colunas dela, e porque é a única parte que
**não se desfaz** depois de aplicada ([backend/05 · migrations](../../architecture/backend/05-persistence.md#migrations)).
Depois a escrita (desfecho e vínculo), e só então a leitura — ler uma coluna que ninguém preenche
produz uma tela que mente por omissão.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-07 — Migration: desfecho, vínculo, marcador de versão e índices 🔲

Uma migration versionada nova (o número é o próximo livre; não se chuta), com o plano de reversão no
topo, conforme D-01, D-04, D-05, D-08:

- a linha de desfecho (pela recomendação da D-01: `decision` aceita `concluded`, colunas anuláveis
  `outcome`, `duration_ms`, `exit_code`), com `CHECK`: só `concluded` carrega `outcome` e tem input
  `'{}'`, e `concluded` não carrega veredito (S-20);
- colunas anuláveis de vínculo: `workspace_path`, `engine` e `conversation_id` (a conversa como
  `ConversationRef` do [plano 28](../28-agent-neutral-core/README.md), nunca um `claude_session_id` —
  [D-15](decisions.md#d-15--o-núcleo-neutro-do-plano-28)), `prompt_id` (o turno, id nosso que o
  adapter entrega), `tracks_outcome`. O `tool_kind` ao lado do `tool_name` já vem da F5 do 28;
- o kind `audit.exported` no `CHECK` de `audit_events.kind` (usado na F3);
- índices que a leitura precisa, cada um com a consulta que o justifica na mesma migration: `(user_id,
  at)` para resumo e facetas, `(user_id, workspace_path, seq DESC)` para o filtro de pasta, e o índice de
  busca da D-08.

`ADD COLUMN` sem default não reescreve linha nem dispara a trigger de `UPDATE` — é o mesmo argumento da
`0009` ([03 · D-15](../03-rules-and-audit/decisions.md#d-15--a-correlação-nasce-com-a-entrada)), e a S-16
o prova em vez de supor. As funções da trigger **não** são tocadas: o piso de 2160 horas
([03 · D-21](../03-rules-and-audit/decisions.md#d-21--o-piso-são-2160-horas-não-90-dias-de-calendário))
vale para as linhas novas porque vale para a tabela (S-14, S-15). A purga não muda: as linhas novas
moram nas mesmas duas tabelas que ela já varre
([03 · D-20](../03-rules-and-audit/decisions.md#d-20--a-trilha-são-as-duas-tabelas)).

### B-08 — O hook de desfecho 🔲

No runner do adapter do Claude (`adapter/outbound/engines/claude/`, onde a F1 do
[plano 28](../28-agent-neutral-core/F1-engine-port.md) o pôs), junto do `PreToolUse` e **no mesmo lugar**
onde `settingSources` e o `canUseTool` são passados. O adapter traduz os hooks do Claude para o
desfecho canônico, e o núcleo nunca vê um hook ([D-15](decisions.md#d-15--o-núcleo-neutro-do-plano-28)):

- `PostToolUse` passa a chamar também o registro de desfecho, além do journal do desfazer que já roda
  lá; `PostToolUseFailure` é registrado **só** para o desfecho (o journal continua sem ele, pelo motivo
  que o comentário do runner dá: falha não muda arquivo); `PermissionDenied` conforme a B-01;
- um use case novo em `application/audit` (`RecordToolOutcomeUseCase`), com a sua porta do lado de
  `session` (`ToolOutcomeRecorder`, como o `ToolInvocationRecorder` do `PreToolUse`);
- **nunca recusa nada** e **nunca derruba a sessão**: a tool já rodou. Falha ao gravar loga `error` e o
  item aparece com "desfecho não registrado" (S-11). É o oposto do `PreToolUse`, e pelo mesmo motivo — o
  que protege a autorização é a intenção gravada antes; o desfecho é prestação de contas;
- a leitura do código de saída (o prefixo `Exit code N` do `error`, se a B-01 confirmar) é do
  adapter: o núcleo recebe só o número, ou `null`;
- grava status, duração e código de saída (D-01). **Nunca** `tool_response` nem o texto de `error`: um
  teste planta um segredo nos dois e o procura no banco, no log e na resposta HTTP (S-10). O log de I/O
  da borda (`debug`) registra o fato — tool, `toolUseId`, status, duração —, sem saída;
- o dono é resolvido como no recorder do `PreToolUse`, mas sem cair em `unknown` quando a sessão acabou
  de encerrar (S-18): o dono de uma sessão encerrada está na própria linha `recorded`.

O SDK falso (`backend/test/e2e/scripted-main.ts` e as fixtures) passa a disparar os hooks de desfecho
que a B-01 mediu, na ordem medida — inclusive o desfecho que chega antes da linha de decisão (S-13).

### B-09 — Pasta, conversa, turno e aparelho, gravados com a entrada 🔲

Conforme D-04 e D-06:

- o runner passa `workspacePath`, a `conversation { engine, id }` e o `prompt_id` do hook ao registro
  ([D-15](decisions.md#d-15--o-núcleo-neutro-do-plano-28)); as linhas
  `recorded` e `concluded` os gravam, e `tracks_outcome = true` na `recorded` (D-05);
- a linha de decisão (`RecordDecisionOnResolved`) grava a pasta e a conversa da sessão, e o `device_id`
  do aparelho quando a resposta veio do celular — a coluna existe desde a `0003` e hoje é sempre `null`;
- retomada in-place grava a conversa certa na entrada, que é o caso que `session_origins` não cobre
  (S-22);
- o título da conversa **não** é gravado — é o primeiro prompt, e `lint:arch` reprova quem tentar
  (S-26).

### B-10 — A invocação como unidade 🔲

Porta nova de leitura (`AuditInvocationReader`), ligada só ao `AuditQueryModule`, e o adapter Drizzle:

- agrupa por `(session_id, tool_use_id)`; linha sem `toolUseId` é um item sozinho (S-29);
- **âncora**: a linha `recorded`, ou — quando a retenção levou parte da invocação — a mais antiga que
  restou (S-30); cursor keyset descendente sobre o `seq` da âncora, como a
  [D-06 do plano 03](../03-rules-and-audit/decisions.md#d-06--paginar-sobre-o-tempo) (S-34, S-35);
- **estado derivado**, pela D-05: esperando resposta · sem pergunta · decidida · em execução ·
  concluída (com `outcome`) · não concluiu (sessão encerrada) · desfecho não registrado (anterior);
  "viva ou não" vem de uma porta para `session` (`LiveSessionLookup`), nunca de ler o registro de
  outro módulo por dentro;
- filtros: sessão, pasta, `kind`, ferramenta nativa (opaca), decisão, desfecho, período, `toolUseId` e a
  busca da B-14; filtro por
  decisão e desfecho juntos exige as duas linhas (S-37);
- sessão de outra pessoa → `403 FORBIDDEN`, pela mesma regra da
  [03 · D-17](../03-rules-and-audit/decisions.md#d-17--a-trilha-de-outro-é-a-sessão-de-outro) (S-38);
- o input sai por `disclosedInput`, decidido pelo `kind` e nunca pelo nome da ferramenta: de um
  `file.read`, só o `subject` e a janela que o adapter normaliza — a lista de permissão do plano 03,
  agora por `kind` (S-41, [D-15](decisions.md#d-15--o-núcleo-neutro-do-plano-28));
- **plano de execução verificado** com uma fixture de 100 mil linhas, para cada combinação de filtro,
  como a B-14 do plano 03 fez: nenhuma varredura da tabela, e a página para depois de `limit + 1`
  âncoras (S-36).

### B-11 — Os eventos e a linha do tempo unificada 🔲

Hoje nenhuma porta lê `audit_events`. Esta task cria a leitura (escopada por usuário, keyset sobre o
`seq` de lá) e, pela D-03, a linha do tempo: cada página toma das duas cabeças por momento, e o cursor
composto guarda o menor `seq` consumido de cada tabela (S-42, S-43). Cursor adulterado é `400` (S-48).

- `types=invocations|events` e o efeito dos filtros que só invocações têm (S-44);
- relógio ajustado para trás: a ordem entre fontes pode inverter, e nada some (S-45);
- `kind` que esta versão não conhece sai cru, sem derrubar a página (S-46) — o `isAuditEventKind` do
  domínio hoje descartaria a linha;
- filtro de pasta alcança os eventos que têm pasta (`session.*` pelo `subject_label`,
  `session.filesRewound` também pelo `details`) e exclui os que não têm (aparelho, regra).

### B-12 — Resumo e facetas 🔲

- `GET /audit/summary`: contagens do período e do filtro por decisão, desfecho, `kind` e pasta, **iguais**
  às que a lista devolveria (S-49); a data mais antiga disponível (retenção) e a data da última purga —
  **sem** contagem de purga, que é da máquina inteira (S-54, S-55);
- `GET /audit/facets`: sessões do período com pasta, primeira e última atividade, contagem e **título
  da conversa** lido pela porta de `transcript` (`ConversationTitleLookup`), com o cache por
  `lastModified` e a coalescência que o plano 04 já tem (S-51, S-53); SDK fora → sem título, sem erro
  (S-52); os `kind` e as ferramentas nativas vistas, com o `label` e a contagem; pastas. O título é
  lido pela `ConversationRef` (`engine` + `conversation_id`), e o motor fora é o `AGENT_UNAVAILABLE` do
  plano 28.

### B-13 — Detalhe e endereço permanente 🔲

- `GET /audit/invocations/:id`: a linha do tempo da invocação (cada linha com momento, o que foi, quem,
  de onde) e os vínculos — regra (`ruleId` e escopo), sessão, pasta, conversa, turno, aparelho, `traceId`
  (S-56). Busca também pelo par `sessionId` + `toolUseId`, que é o que o "ver na trilha" do workbench usa
  (S-62);
- `GET /audit/events/:id`, com os mesmos status (S-61);
- `403 FORBIDDEN` de outra pessoa; `404 AUDIT_ENTRY_NOT_FOUND`; `410 AUDIT_ENTRY_PURGED` quando o momento
  do ULID é anterior ao maior `cutoff` já purgado (D-07); `400` para id que não é ULID (S-57…S-60).

### B-14 — Busca em todo o input 🔲

Conforme a D-08, **depois de medir**: o índice escolhido com a fixture de 100 mil linhas e inputs de
`Write` realistas (tamanho do índice, tempo da busca, plano de execução — S-67). O texto buscado é o
mesmo que a leitura mostraria (S-65); termo com menos de três caracteres é `400` (S-64); `%`, `_`, `\` e
aspas são literais (S-66). A medição fica registrada no [progresso](progress.md).

### B-15 — Rotas, módulo e log de I/O 🔲

- controllers e DTOs das rotas da B-03, validação na borda com o `ZodPipe`, erros pelo filtro de domínio;
- tudo no `AuditQueryModule` — nenhum módulo que escreve na trilha recebe um leitor, e o `lint:arch`
  verifica (S-71);
- log de I/O em `debug` em cada borda nova (HTTP, banco, porta de `transcript`), com filtros, contagem e
  duração, **sem** input de tool na linha de leitura (S-68) — o log da gravação continua sendo parte da
  trilha, como o runner já faz;
- `GET /audit-entries` intacto (S-70).

---

## Cenários cobertos

S-06…S-71.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
