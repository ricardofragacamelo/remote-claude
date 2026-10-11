# Plano 28 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F6 — extensões isoladas. A F5 fechou em 2026-10-10, com o `pnpm verify` verde no ciclo 22 (a F4, no ciclo 19; a F3, no 17; a F2, no 14; a F1, no 10; a F0, no 2)
**Última atualização:** 2026-10-10
**Bloqueios:** nenhum. A F1 do [plano 26](../26-mobile-conversation-parity/README.md), a dependência da [D-01](decisions.md#f0--normas), fechou em 2026-10-10. Nenhuma decisão aberta: as 18 foram decididas em 2026-10-10, três contra a recomendação (D-09, D-10, D-11) — ver [decisions.md](decisions.md). Este plano **bloqueia** o 26 (F2…F7), o 13 (F2…F4), o 27, o 14, o 15, o 16 e o 18 ([índice dos planos](../README.md#ordem-de-execução))

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F7 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-norms.md) | B-01…B-07 | 7/7 | ✅ |
| [F1](F1-engine-port.md) | B-08…B-13 | 6/6 | ✅ |
| [F2](F2-canonical-tools.md) | B-14…B-19 | 6/6 | ✅ |
| [F3](F3-interactions.md) | B-20…B-25 | 6/6 | ✅ |
| [F4](F4-modes-and-usage.md) | B-26…B-30 | 5/5 | ✅ |
| [F5](F5-permission-dialect.md) | B-31…B-35 | 5/5 | ✅ |
| [F6](F6-engine-extensions.md) | B-36…B-42, B-48 | 0/8 | 🔲 |
| [F7](F7-e2e.md) | B-43…B-47 | 0/5 | 🔲 |
| **Total** | **B-01…B-48** | **35/48** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 136 | 29 | 1 | 106 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 46 | 0 | 0 | 46 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-10 | F0 | 3 — tipos | os objetos de termo dos testes do portão saíam com `match: string`, e o bloco do ESLint gerado por motor (`WEB_ENGINES.map`) com a regra como `(string \| objeto)[]` | os termos dos testes passam por um `termOf` tipado como `VocabularyTerm`, e o bloco gerado é anotado como `Linter.Config` | reinício do portão 1 |
| 2 | 2026-10-10 | F0 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 885 s), com o `docs:check` e o `neutral:check` verdes; o teste de integração do S-21 (`mobile.mjs arch` com uma feature importando `engines/`) rodado à parte — **F0 concluída** |
| 3 | 2026-10-10 | F1 | 1 — formatação | dois arquivos novos da F1 fora do Prettier (o teste de tipo do S-29 e o `contracts-model.mjs` do `x-protocol-version`) | `prettier --write` nos dois | reinício do portão 1 |
| 4 | 2026-10-10 | F1 | 3 — tipos | o Prettier quebrou a linha do teste de tipo do S-29, e o `@ts-expect-error` deixou de ficar logo acima do erro que marcava | o payload errado vai para uma constante antes, e cada declaração cabe numa linha | reinício do portão 1 |
| 5 | 2026-10-10 | F1 | 5 — duplicação | 7 clones da F1: as rotas da `v1` e da `v2` do controller do histórico repetiam os parâmetros, blocos de `import` iguais em três use cases e em dois hooks do web, duas descrições iguais nos schemas `subagent-page` e `transcript-page`, e a guarda da conversa repetida na página da sessão do app | as rotas da `v1` leem um objeto de parâmetros validado (`previousToolSchema`, `previousImageSchema`), os `import` foram reordenados, as descrições dos schemas diferem, e o app ganhou o `_inConversation` | reinício do portão 1 |
| 6 | 2026-10-10 | F1 | 1 — formatação | a troca do `blockIdSchema` por `sed` veio depois do Prettier | `prettier --write`; o `format:check` passa a rodar antes de cada verify | reinício do portão 1 |
| 7 | 2026-10-10 | F1 | 6 — unit | os testes do pacote `contracts` (`test/unit/contracts-guards.spec.mjs`) ainda esperavam a `v1` (versão 1, `resumeSessionId`, `conversationId`), e o `.env.example` declarava duas variáveis sob um comentário só | os testes passam a afirmar a `v2` e a janela (o envelope aceita 1 e 2, recusa 0 e texto), e cada variável ganhou o seu comentário | reinício do portão 1 |
| 8 | 2026-10-10 | F1 | 7 — cobertura | três arquivos novos da F1 abaixo de 90%: o DTO de `GET /sessions` (o ramo da retomada), o controller do histórico (as rotas da `v1` e a listagem, que só a integração cobria) e o `agent-sdk.adapter` (o id de conversa que não é UUID) | testes unitários do DTO e do controller, e o caso do id inválido no adapter | reinício do portão 1 |
| 9 | 2026-10-10 | F1 | 7 — cobertura | `push.flow.spec.ts` · S-50 ("cancels the retry waiting when somebody answers first") falhou sob a carga da suíte; o arquivo não foi tocado pela F1 | nenhuma no código: rodado sozinho três vezes, 15/15 em cada — o mesmo padrão dos testes de push instáveis sob carga já conhecidos (S-51) | reinício do portão 1 |
| 10 | 2026-10-10 | F1 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 726 s), com o `docs:check`, o `contracts:check`, o `i18n:check` e o `neutral:check` verdes, e a integração do backend tocada pela F1 rodada à parte (a janela, as rotas, a migration 0021, `GET /engines`) — **F1 concluída** |
| 11 | 2026-10-10 | F2 | 3 — tipos | o teste novo do modo `access` do portão de neutralidade passava `vocabulary.terms[0]` (`VocabularyTerm \| undefined`) ao `hitsIn` | o termo vira uma constante tipada, usada pelo vocabulário e pelo teste | reinício do portão 1 |
| 12 | 2026-10-10 | F2 | 6 — unit | os testes dos guards do pacote `contracts` (`test/unit/contracts-guards.spec.mjs`) montavam `tool.started` e `permission.requested` com `toolName` e `input` | os payloads passam pela forma canônica (`shellCall`), e um caso afirma que a forma antiga não passa mais no guard | reinício do portão 1 |
| 13 | 2026-10-10 | F2 | 3 — tipos | o helper `shellCall` do mesmo teste sem o tipo do parâmetro | `@param {string}` no JSDoc; o `typecheck` da raiz passa a rodar antes do verify, ao lado do `format:check` | reinício do portão 1 |
| 14 | 2026-10-10 | F2 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 1123 s), com o `docs:check`, o `contracts:check`, o `i18n:check`, o `render:check` e o `neutral:check` verdes (nenhuma entrada da F2 no baseline), a suíte inteira do backend com integração (5260 testes) e a do app (2169) rodadas à parte — **F2 concluída** |
| 15 | 2026-10-10 | F3 | 6 — unit | a lista de tipos de frame do teste do pacote `contracts` não tinha o `session.compact` e o `session.tasksChanged` | os dois tipos na lista; a suíte unit da raiz (`vitest run test/unit`) passa a rodar antes do verify | reinício do portão 1 |
| 16 | 2026-10-10 | F3 | 7 — cobertura | `transcript-api.spec.ts` · S-38 comparava duas respostas inteiras, e o `writtenAgoSeconds` (lido do relógio a cada pedido) mudou de um segundo entre elas | a comparação aceita qualquer número nesse campo; o teste é da F1 e o defeito, de relógio, não da F3 | reinício do portão 1 |
| 17 | 2026-10-10 | F3 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 828 s), com o `docs:check`, o `contracts:check`, o `i18n:check`, o `render:check` e o `neutral:check` verdes (nenhuma entrada da F3 no baseline), a suíte inteira do backend com integração (5390 testes) e a do app (2189) rodadas à parte — **F3 concluída** |
| 18 | 2026-10-10 | F4 | 2 — lint | o parêntese do item de array de enum no gerador (`contracts-typescript.mjs`) subiu a complexidade do `typeExpression` para 11 | o ramo do array virou a função `arrayExpression` | reinício do portão 1 |
| 19 | 2026-10-10 | F4 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 728 s), com o `docs:check`, o `contracts:check`, o `i18n:check`, o `render:check` e o `neutral:check` verdes (nenhuma entrada da F4 no baseline; as quatro da recusa do `bypassPermissions` nos padrões foram para a F6, D-40), a suíte inteira do backend com integração (5548 testes) e a do app (2234) rodadas à parte — **F4 concluída**, com o S-90 🟡 nos clientes (adiado para o plano 27) |
| 20 | 2026-10-10 | F5 | 7 — cobertura | `push.flow.spec.ts` · S-51 falhou sob a carga da suíte; o arquivo só mudou de caminho de import na F1 | nenhuma no código: rodado sozinho três vezes, 15/15 em cada — instabilidade sob carga já conhecida | reinício do portão 1 |
| 21 | 2026-10-10 | F5 | 7 — cobertura | `session-changes.spec.ts` · S-118 falhou sob carga (load 18 na máquina, fora do verify); sozinho, falhou 1 de 3 vezes e passou as outras duas | nenhuma no código: o teste é de antes do plano 28 e está na lista dos instáveis sob carga; o ciclo seguinte esperou a carga baixar | reinício do portão 1 |
| 22 | 2026-10-10 | F5 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 726 s), com o `docs:check`, o `contracts:check`, o `i18n:check`, o `render:check`, o `neutral:check` (nenhuma entrada da F5) e o `jscpd` verdes, a suíte inteira do backend com integração (5809 testes) e a do app (2242) rodadas à parte — **F5 concluída** |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-10 | As decisões D-02, D-04…D-11 e D-13…D-17 respondidas, e a D-18 nova | revisão dos gaps pelo usuário, em perguntas; três escolhas contra a recomendação: todo o REST no pacote (D-09), nenhum kind de auditoria com nome de motor (D-10), gramática canônica de regra já (D-11), com a migração de todas as regras (D-18) | nascem a B-48 (F6), os S-131…S-136 e o R-09; mudam a B-31, a B-33, a B-36, a B-01 e a B-12; os planos 13, 14, 15 e 18 ajustados na mesma data |
| 2026-10-10 | Plano criado a partir da [discovery 10](../../discovery/10-nucleo-canonico-e-agentes-isolados.md), com a ordem da D-01 e a D-12 decididas | pedido do usuário: "gerar o plano e gravar as dependências", e "alterar outros planos que não foram executados com as novas diretivas" | os planos 12, 13, 14, 15, 16, 18, 19, 26 e 27 ajustados na mesma data, cada um com a sua decisão ✅; a B-07 confere os ajustes contra as normas da F0 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-10 | No app, o "Compactar" num motor com `compaction` e **sem** `contextUse` | o botão mora na folha do medidor de contexto, que some sem `contextUse`; com o Claude, os dois existem | [plano 26](../26-mobile-conversation-parity/README.md), que redesenha a sessão do app; o web já o oferece fora do medidor |
| 2026-10-10 | S-90 nos clientes: um bloco de tipo desconhecido ainda some no web e no app | o backend o deixa passar com o nome do motor, mas o desenho genérico de bloco desconhecido não existe nas pontas; criá-lo pede chaves novas e o par do app | [plano 27](../27-conversation-losses/README.md), B-20 (U-05), que é dono dessa regra; o cenário fica 🟡 até lá |
| 2026-10-10 | O texto do motivo de um motor indisponível (`engine.error.securityUnmet`, e o `notInstalled` do `GET /engines`) | o backend já manda o motivo como `messageKey`, mas nenhuma tela desenha um motor indisponível hoje, e uma chave sem uso reprova o `i18n:check` | F7, B-45: o seletor de motor do motor de teste é a primeira tela que mostra um motor fora do ar |
| 2026-10-10 | Capacidade desconhecida (`capabilities` nulo): o web mantém o controle e deixa o servidor recusar, o app o esconde | as duas leituras cabem no "declarada, nunca suposta"; com o Claude, a sessão sempre declara | F7, B-45: o e2e do motor de teste fixa uma regra única nas duas pontas |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | A classificação canônica erra, e uma ferramenta que escreve sai como leitura | 🟡 mitigado | B-14, B-16: tabela exaustiva (um nome novo sem classificação não compila), `other` sempre `destructive`, e o risco de cada nome comparado com o de antes num teste de paridade (D-29); fica aberto até a F7 provar com o motor de teste |
| R-02 | A neutralização muda o comportamento com o Claude | 🔲 aberto | B-46 |
| R-03 | O app publicado quebra com o `v+1` | 🔲 aberto | D-08 |
| R-04 | O plano atrasa a paridade do app (26) e o 13 | ✅ aceito | D-01 |
| R-05 | O baseline vira esconderijo de violação | 🔲 aberto | B-05 |
| R-06 | A F6 conflita com outra sessão no mesmo working tree | 🔲 aberto | F6 roda sem outro plano em andamento no tree |
| R-07 | A migração da conversa perde a ligação com checkpoint ou origem | 🔲 aberto | B-11 |
| R-08 | As telas supõem a capacidade presente | 🔲 aberto | B-43…B-45 |
| R-09 | A migração das regras desliga ou muda o alcance de uma regra em uso | 🔲 aberto | D-18, B-33 |

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
