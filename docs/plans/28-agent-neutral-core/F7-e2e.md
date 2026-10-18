# F7 — E2E

Plano: [28 — Núcleo neutro de agente](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F6](F6-engine-extensions.md): o núcleo neutro nas três pontas.
**Entrega:**

- um motor que não é o Claude é desenhado igual, nas duas pontas, pela porta do usuário;
- o Claude continua exatamente igual, contra as fixtures gravadas e contra o CLI real;
- o baseline do núcleo está vazio, e a janela de `v-1` fechou.

---

## Por quê

O portão de neutralidade prova a **ausência** de palavra. Ele não prova que a tela funciona sem o Claude.
Só um motor diferente, com outras ferramentas e menos capacidades, prova o R3 ([D-14](decisions.md#f7--e2e)).
E o critério do plano é "tudo funciona igual", que só o e2e de hoje e o `smoke-live` provam
([R-02](README.md#riscos-e-decisões-em-aberto)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-43 — O motor de teste e a suíte de contrato da porta ✅

O motor de teste é um adapter falso em `backend/test/fakes/engine/`, ao lado do fake do SDK. Ele tem:

- `displayName` "Test agent";
- ferramentas nativas com outros nomes (`write_file`, `run_shell`, `ask_user`), classificadas por uma
  tabela própria;
- capacidades a menos: sem esforço, sem compactação, sem plano, sem contexto e sem custo em US$;
- um roteiro de turnos no molde do `scripted-query.ts`.

Ele é registrado só pela composição de teste (`RC_ENGINES_ENABLED=claude,test` no e2e) e nunca entra no
build de produção.

A **suíte de contrato da porta** é a mesma bateria das seis dimensões, rodada contra o adapter do Claude
(sobre o fake do SDK) e contra o motor de teste. Ela é a semente da suíte da
[discovery 03 §7.7](../../discovery/03-multiplos-motores-de-agente.md#77-testes-e-scripts). O
[backend/07](../../architecture/backend/07-testing.md) e o [shared/06](../../architecture/shared/06-testing-strategy.md)
ganham a dimensão motor. Cenários S-120…S-122.

### B-44 — O e2e do web com o motor de teste ✅

Pela porta do usuário, uma sessão no motor de teste:

- a conversa desenhada pelo `kind`, com o rótulo, o card e a permissão iguais aos do Claude para o mesmo `kind`;
- os controles sem capacidade ausentes (seletor de esforço, medidor de contexto, `/compact`, a faixa de
  tarefas quando não há);
- o nome "Test agent" onde hoje se lê "Claude";
- nenhuma tela do núcleo com "Claude" no texto.

Cenários S-123, S-124.

### B-45 — O e2e do app com o motor de teste ✅

O mesmo roteiro da B-44 no emulador, pelo `pnpm test:e2e:mobile`, que o `verify:full` não roda (o portão
9 é só do web). Ele confere o mesmo desenho que o web, pela regra de paridade do
[plano 26](../26-mobile-conversation-parity/README.md). Cenários S-125, S-126.

### B-46 — A regressão com o Claude ✅

- Todos os e2e de hoje, do web e do app, verdes **sem mudar cenário**. ✅ — S-127. `pnpm test:e2e`:
  115–116/141, só a mesma classe de instabilidade sob carga já conhecida (25 falhas estáveis em duas
  rodadas, nenhuma nova). `pnpm test:e2e:mobile`: achou uma falha real — o `BrowserSocket` do arnês
  (`mobile/integration_test/support/e2e_environment.dart`) tinha `v: 1` fixo em cada frame, de antes da
  janela de protocolo da F1; a conexão virava uma cliente de `v-1`, e `04·S-48` recebia o
  `session.started` traduzido (`claudeSessionId`, sem `conversation`) — corrigido para falar
  `protocolVersion` (o gerado, hoje 2); suíte completa re-rodada, 39/39.
- O `smoke-live` (`pnpm test:e2e:live`) contra o Claude real. ✅ — a primeira rodada achou três coisas
  reais, nenhuma abafada: ver [progress.md, ciclo 35](progress.md#histórico-de-validação). Dois specs
  falhavam por arnês não migrado (`claude-panel.spec.ts`: `readsOf()` ainda lia `file_path` em vez de
  `paths`/`window`, de antes do B-16/B-15) e um terceiro achou um variant real do SDK nunca mapeado:
  `system:commands_changed`, caído no ramo de sobrevivência do mapper
  (`unmapped sdk message variant — dropped`) durante a sessão do `claude-panel.spec.ts`. Corrigido o
  arnês e mapeado o variant de verdade — novo evento canônico `session.commandsChanged`, espelhando o
  padrão "lista inteira, toda vez" do `session.mcpStatusChanged` ([05-websocket-protocol.md](../../architecture/shared/05-websocket-protocol.md))
  — e não só documentado, por decisão explícita do usuário. Rodada seguinte: os três specs (`claude-panel.spec.ts`,
  `commands-and-init.spec.ts`, `sdk-contract.spec.ts` · S-83) verdes, `3 passed (49.3s)`, sem nenhum
  variant caindo no ramo desconhecido.
- As fixtures gravadas dos planos [22](../22-live-history/README.md), [24](../24-structured-questions/README.md)
  e [26](../26-mobile-conversation-parity/README.md) passadas pelo mapper novo, com o conteúdo desenhado
  conferido contra o de antes (o JSON neutro da 26 · B-28, quando existir; senão, o que os testes de hoje
  conferem). ✅ — a 26 · B-28 ainda não existe (F2…F7 de lá 🔲); conferido pelos testes de hoje:
  `pnpm --filter backend test:unit` (318 arquivos, 4496 testes) e `test:integration` (98 arquivos, 1405
  testes), que exercitam todas as fixtures de `backend/test/fakes/agent-sdk/fixtures/` — as do 22
  (`image-turn`, `long-tool-turn`, …), as do 24 (`plan-turn`, `question-turn`) e as do 26
  (`markdown-rich-turn`, `mcp-untitled-tool-turn`, `diagram-turn`, …) — todos verdes, sem mudança de
  conteúdo desenhado.

Cenários S-127 ✅, S-128 ✅.

### B-47 — O baseline vazio e a janela fechada ✅

- O baseline do núcleo fica **vazio** (`scripts/engine-neutrality-baseline.json`, `entries: []`), a
  opção `--write-baseline` sai de `scripts/engine-neutrality.mjs` e de `scripts/lib/engine-neutrality.mjs`
  (`writtenBaseline` removida), e o portão passa a reprovar qualquer violação, sem exceção além dos
  nomes do produto (`scripts/engine-vocabulary.json`'s `exceptions`). As 75 entradas da F6→F7 (todas
  as já tagueadas F7) foram resolvidas de verdade, não abafadas: reescrita de prosa para `claude`/`sdk`
  em ~25 arquivos do backend e dos schemas; o termo `Agent` deixou de colidir com o nome nativo da
  ferramenta via `kinds: ["string"]` no vocabulário (D-50); `web/src/app/engines.ts` virou
  `web/src/app/engines/index.ts` — o mesmo recurso de isenção por segmento de pasta que o backend já
  usava para `infrastructure/modules/engines/`.
- A janela de `v-1` fecha ([D-08](decisions.md#f1--porta-de-motor-e-conversa)): `protocol-window.ts` e
  `previous-tool-fields.ts` saem inteiros; `SUPPORTED_VERSIONS` passa a ter só a versão atual; as
  quatro rotas de `GET /transcripts/:sessionId/…`, o `GET /diag/versions`'s `agentSdk`/`claudeCli` de
  nível raiz, o `ClaudeLegacyController` inteiro (`/claude/models`, `/claude/defaults*`) e as três
  rotas duplicadas de `ClaudeController` (`/claude/account`, `/claude/installation`,
  `/claude/diagnostics/model-check`) saem; o `name` de cada categoria de `GET /sessions/:sessionId/context`
  e o `taskId` de `tool.completed` saem do fio (a lógica de `taskOf()` continua, só não viaja mais
  nessa forma). A migration `0026_window_closed.sql` derruba `claude_session_id` dos três tabelas que
  `0021` copiou para `(engine, conversation_id)`, e promove a chave primária de `session_origins` para
  o par — achados documentados em D-50, além do que o enunciado da task já citava.
- A discovery 10 e o índice das discoveries são marcados como implementados.

Cenários S-129 ✅, S-130 ✅.

---

## Cenários cobertos

S-120…S-130.

---

## Critério de conclusão

```bash
pnpm verify:full         # portões 1-11, com o neutral:check e o baseline vazio
pnpm test:e2e:mobile     # o portão 9 é só do web
pnpm test:e2e:live       # o Claude real
```
