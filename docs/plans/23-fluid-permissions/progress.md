# Plano 23 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — o plano está concluído nas tarefas e nos cenários, e a árvore passou nos portões em 2026-10-08 (`pnpm verify:full` com os onze portões verdes e `pnpm test:e2e:mobile` 32/32, no fechamento do plano 22), depois das correções dos ciclos 6 e 7
**Última atualização:** 2026-10-08
**Bloqueios:** nenhum

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-norms.md) | B-01…B-03 | 3/3 | ✅ |
| [F1](F1-allow-all.md) | B-04…B-07 | 4/4 | ✅ |
| [F2](F2-rule-reach.md) | B-08…B-11 | 4/4 | ✅ |
| [F3](F3-web.md) | B-12…B-14 | 3/3 | ✅ |
| [F4](F4-mobile.md) | B-15…B-17 | 3/3 | ✅ |
| [F5](F5-e2e.md) | B-18, B-19 | 2/2 | ✅ |
| **Total** | **B-01…B-19** | **19/19** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 100 | 0 | 0 | 100 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 14 | 0 | 0 | 14 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-07 | todas | 5 — duplicação | assinatura da resposta repetida no app; log repetido na ponte; trechos do e2e do app iguais aos do `rule_cycle_test` | `OutgoingAnswer`; `fieldsOf()` na ponte; ajudantes em `integration_test/support/browser_turns.dart` | verde |
| 2 | 2026-10-07 | todas | 1 — formatação | `ChoiceMenu.tsx` fora do Prettier | `prettier --write` | verde |
| 3 | 2026-10-07 | todas | 2 — lint | `test/unit/contracts-guards.spec.mjs`, do plano 22 em andamento na mesma árvore — **não é deste plano** | nenhuma: o arquivo é da outra sessão | vermelho, fora do alcance |
| 4 | 2026-10-07 | todas | 3, 6, 7 rodados à parte | deste plano: complexidade de `permissionRequestFrom` (15), o marco do plano no histórico geral, e `permission_repository.dart` com 33 % de linhas. Da outra sessão: `contracts-guards.spec.mjs`, `.env.example`, `failure_messages.dart` | `_offersOf()` no mapper; o marco; teste do `OutgoingAnswer` | os itens deste plano verdes; cobertura de backend, web e app verde |
| 5 | 2026-10-07 | todas | 8, 9, 11 rodados à parte; 10 — segurança | três avisos novos em dependências que este plano não tocou: `source-map-js` GHSA-68fv-2mgg-jv7q, `proxy-addr` GHSA-jqcg-44mw-7w3h, `@modelcontextprotocol/sdk` GHSA-6qxp-vccf-f47h. As regras do Agent SDK (602 arquivos) e os segredos passam | atualizar as dependências fica para o usuário decidir, com a outra sessão na árvore | integração, e2e (124) e contratos/i18n verdes; segurança vermelha por dependência |
| 6 | 2026-10-07 | todas (achado pelo plano 22) | 7 — `rule-reach.gateway.spec` instável, o caso que falha mudando de execução para execução | **bug de concorrência, não do teste:** duas respostas ao mesmo pedido viam-no pendente e gravavam cada uma a sua regra antes do `settle` decidir quem ganhou; a regra de quem perdeu (S-65) vazava para o caso seguinte | `ResolvePermissionUseCase` atende as respostas a um pedido uma de cada vez, na ordem de chegada; dois casos S-65 no unit (`resolve-with-reach.spec`) | integração 6/6 seguidas verdes; a serialização expôs a janela seguinte (S-50 do `permission-bridge.spec` em timeout): a `PermissionBridge` só escutava o `permission.resolved` depois do `RequestPermissionUseCase` voltar, e uma resposta nesse meio-tempo deixava o loop do agente esperando para sempre. Agora escuta antes de perguntar, e solta o ouvinte quando ninguém foi perguntado |
| 7 | 2026-10-08 | todas (achado pelo plano 22) | e2e do app — 02·S-54 e 05·S-79 | o card com os alcances cresceu: o botão "Abrir a sessão" ficou abaixo da dobra (S-54), e o tempo novo expôs a recusa de renovação escapando pelo `DeviceController` (S-79, bisseção até o `permission_mapper.dart`) | S-54 rola até o botão; o `DeviceController` lê uma entrada que falhou como ninguém entrou, com teste unit — detalhes no [diário do plano 22](../22-live-history/progress.md) (ciclos 15-17); a segurança do ciclo 5 também foi resolvida lá (ciclo 13) | verde: `verify:full` 0 e `test:e2e:mobile` 32/32 |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-07 | O `PermissionRuleBook` ganhou `lookup()`, que diz se a leitura **falhou**; `answering()` continua, por cima dele | Permitir tudo não pode aprovar quando um `deny` pode não ter sido lido ([D-12](decisions.md#f1--permitir-tudo)) | B-05 |
| 2026-10-07 | A resposta sem pergunta (regra ou modo) virou o colaborador `PermissionAutoAnswer`, usado pelo pedido e pela troca de modo | os dois precisam da mesma ordem — regras, depois modo —, e a segunda cópia é a que esquece ([D-06](decisions.md#f1--permitir-tudo)) | B-05, B-06 |
| 2026-10-07 | O teste S-64 do plano 03 (`echo )` só oferecia escopos efêmeros) mudou: agora há o alcance de prefixo `Bash(echo:*)` | é exatamente a S-53 deste plano; o padrão exato continua não existindo | `request-permission.use-case.spec.ts` |
| 2026-10-07 | O web passou a dizer "Recusado por uma regra sua" em vez de "ninguém respondeu a tempo" para uma recusa por regra (chave `permission.outcome.ruleDenied`) | antes do `via`, as duas eram indistinguíveis na tela; o app já as distinguia | B-14 |
| 2026-10-07 | `parseRulePattern` ganhou a irmã `readRulePattern`, que devolve `null` | o cálculo dos alcances precisa saber se um padrão lê de volta sem um `catch` que engole o erro | B-09 |
| 2026-10-07 | Os ajudantes do navegador do e2e do app foram para `integration_test/support/browser_turns.dart` | o `rule_cycle_test` e o novo `fluid_permissions_test` usam os mesmos; copiados, o portão de duplicação reprovaria | B-19 |
| 2026-10-07 | O e2e prova o alcance da tool inteira, não o de prefixo | [D-14](decisions.md#f5--e2e) | B-18, B-19 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| — | — | — | — |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Permitir tudo esquecido ligado | 🔲 aberto | mitigado pelo tom destrutivo do chip, pelo escopo de sessão e por o atalho não passar por ele |
| R-02 | Pedaço de linha que não é o comando que o shell roda | 🔲 aberto | aspas desbalanceadas e barra invertida fazem a linha perguntar (S-37, S-38) |
| R-03 | Prefixo largo demais escolhido num toque | 🔲 aberto | padrões por extenso no card e na segunda etapa; intérprete nunca vira prefixo (S-48) |
| R-04 | O CLI decide antes de nós | ✅ aceito | mesmo R-03 do plano 15 |

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
