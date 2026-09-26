# Plano 04 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F1 — a F0 fechou em 2026-09-25 (backend: o histórico lido pelas funções do SDK, cercado pela allowlist e com a procedência gravada antes do subprocesso)
**Última atualização:** 2026-09-25
**Bloqueios:** nenhum

```
F0 ████████████████████ 100%   ✅ concluída
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-transcript.md) | B-01…B-05 | 5/5 | ✅ |
| [F1](F1-transcript-ui.md) | B-06…B-09 | 0/4 | 🔲 |
| [F2](F2-resume.md) | B-10…B-13 | 0/4 | 🔲 |
| [F3](F3-commands.md) | B-14…B-17 | 0/4 | 🔲 |
| [F4](F4-checkpoint.md) | B-18…B-21 | 0/4 | 🔲 |
| [F5](F5-e2e.md) | B-22…B-25 | 0/4 | 🔲 |
| **Total** | **B-01…B-25** | **5/25** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 74 | 52 | 0 | 22 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 7 | 0 | 0 | 7 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-25 | F0 | 7 — cobertura | `transcript-sdk.ts` com 0 % de funções: a ligação real com o SDK era substituída em todo teste | teste de integração que chama o **SDK real** contra um `CLAUDE_CONFIG_DIR` vazio da suíte — prova também, no SDK de verdade, o "`[]` não é inexistente" da S-56 | reinício do portão 1 |
| 2 | 2026-09-25 | F0 (commit) | hook de pre-commit — segredos | `push-credentials.spec.ts` (plano 02, ainda sem commit) usava um PEM falso como fixture; o gitleaks do hook varre o *stage*, e o `scan:secrets` do `verify:full` não o via antes do commit | fixture trocada por um marcador que não tem forma de chave; as asserções de que a mensagem nunca cita o arquivo foram mantidas, e a da chave passou a checar o próprio valor | backend 1–7 de novo, e o hook |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-25 | O id da conversa no store do Claude é **cunhado por nós** (UUID) e passado ao SDK como `sessionId`; a procedência (`session_origins`) é gravada **antes** do `query()` | gravar depois — lendo o `system:init` — deixa uma janela em que um transcript nosso está no disco e lê como de outra pessoa; e o D-04 fez da origem invariante de correção | B-02, `session` (plano 01), [backend/05](../../architecture/backend/05-persistence.md), migration `0011` |
| 2026-09-25 | Falha ao gravar a procedência **não abre a sessão** | conversa nossa sem registro seria `external` para sempre: visível a quem mais alcança a raiz, e retomável como de outro | B-02, S-71 |
| 2026-09-25 | Cache (16 conversas), concorrência (2 leituras) e prazo (10 s) são **constantes** em `transcript-reads.ts`, não configuração | nada neles depende da máquina ainda; o D-02 pedia teto e limite, não um botão | B-04, S-70, S-74 |
| 2026-09-25 | Prazo estourado é `CLAUDE_TIMEOUT` (504), distinto de `CLAUDE_UNAVAILABLE` (502) | toda chamada externa tem prazo ([04-errors](../../architecture/shared/04-errors-and-http.md)), e "não respondeu" é alarme diferente de "respondeu com falha" | B-05, S-68 |
| 2026-09-25 | Cursor das mensagens é o **id da mensagem**; cursor cuja mensagem sumiu (compactação) é `400` com `transcript.error.cursorStale` | posição crua apontaria, depois da compactação, para a mensagem errada em silêncio; e sessão viva só acrescenta no fim | B-04, S-69 |
| 2026-09-25 | A listagem pagina com o mesmo 25/100 das mensagens, keyset `(lastModified, sessionId)` descendente | o D-03 exige paginação própria (154 sessões num workspace) e não fixou números; o keyset é o do D-02 | B-04, S-57 |
| 2026-09-25 | `GET /transcripts?workspacePath=` lista **um** diretório exatamente; conversa aberta em subdiretório de uma raiz aparece no `workspacePath` do subdiretório | `listSessions({ dir })` não desce a subdiretórios, e `listSessions({})` está proibido pelo D-01 — é o custo da cerca, dito em [backend/03](../../architecture/backend/03-modules.md#transcript) | B-02, F1 (B-06) |
| 2026-09-25 | "Parser próprio de JSONL" é verificado por duas regras de `dependency-cruiser`: `transcript-reads-through-the-sdk` (sem `fs`/`readline` na fatia) e `no-line-reader` (sem `readline` no backend) | é o que a S-09 exige de `lint:arch`; regra sobre import é verificável, "não escreva parser" não é | B-01, S-09 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-25 | E2E **autenticado** das rotas de histórico — a F0 leva ao e2e só as recusas `401` das duas rotas (S-19) e o backend roteirizado passa a trocar também o store de transcripts | o cenário e2e é compartilhado com o app Flutter e tem fase própria; e a F0 não tem tela para a porta do usuário | [F5](F5-e2e.md) — B-22, B-23 |
| 2026-09-25 | Chaves `transcript.error.*` no app Flutter (entraram só no web) | o catálogo do app reprova chave sem uso em Dart, e a tela que as usa é da F1 | [F1](F1-transcript-ui.md) — B-08, B-09 |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | O formato do JSONL é interno do Claude e muda sem aviso | 🔲 aberto | só funções do SDK (B-01); `smoke-live` cobre esta ponta (B-25) |
| R-02 | Sessão criada fora aparecendo pode confundir | 🔲 aberto | feature declarada, restrita à allowlist (D-01); origem vem do nosso banco — o SDK não a informa (S-11) |
| R-03 | O desfazer mexe no disco do usuário | 🔄 medido | spike confirmou que o `rewindFiles()` sobrescreve em silêncio, que o `dryRun` não avisa e que não há filtro por arquivo; por isso o mecanismo é nosso (D-06), e herdamos segurança de link e restauração atômica |
| R-04 | Transcript longo estoura memória a cada leitura | 🔄 medido | `limit`/`offset` não reduzem o trabalho do SDK (~30 MB por chamada); mitigação é cache por `lastModified` e limite de leituras concorrentes (D-02) |
| R-05 | Retomar sessão viva abriria um segundo subprocesso | 🔲 aberto | retomada de sessão viva é `attach` (S-24) |

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
