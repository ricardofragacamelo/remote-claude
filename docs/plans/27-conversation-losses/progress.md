# Plano 27 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-10-10
**Bloqueios:** o plano inteiro espera os planos [26](../26-mobile-conversation-parity/README.md), [13](../13-claude-settings/README.md) e [28](../28-agent-neutral-core/README.md) concluídos, na ordem 26 · F1 → 28 → 26 · F2…F7 → 13 → 27 ([D-01](decisions.md#normas), [D-14](decisions.md#normas)). A D-02 (evento desconhecido no cliente) é um conflito com o [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos) e espera o usuário ([decisions.md](decisions.md))

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F7 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-spike.md) | B-01, B-02 | 0/2 | 🔲 |
| [F1](F1-known-silent.md) | B-03, B-04 | 0/2 | 🔲 |
| [F2](F2-contract.md) | B-05…B-07 | 0/3 | 🔲 |
| [F3](F3-backend-notices.md) | B-08…B-13 | 0/6 | 🔲 |
| [F4](F4-tool-media.md) | B-14, B-15 | 0/2 | 🔲 |
| [F5](F5-history.md) | B-16…B-18 | 0/3 | 🔲 |
| [F6](F6-clients.md) | B-19…B-24 | 0/6 | 🔲 |
| [F7](F7-e2e.md) | B-25…B-28 | 0/4 | 🔲 |
| **Total** | **B-01…B-28** | **0/28** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 107 | 107 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 14 | 11 | 0 | 3 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | *(sem ciclos ainda)* |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-10 | D-14: o plano espera também o [plano 28](../28-agent-neutral-core/README.md); a B-07 é absorvida pelo portão de neutralidade de lá e fica só com as entradas e os testes dos `kind` novos; a B-21 desenha pelo `injected.kind`; caminhos do adapter em `engines/claude/` e rotas por `engine`; a D-10 ganha a nota do critério de capacidade | as diretivas de isolamento, de regras e de canonicidade do plano 28, pedido do usuário | README, F0, F2 (B-05, B-07), F3 (B-08, B-09), F4 (B-15), F5 (B-16), F6 (B-19, B-21, B-24), decisions (D-10), scenarios (S-16, S-17, S-59, S-91, justificativas) |
| 2026-10-10 | Plano criado a partir da [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md), com as D-01…D-11 de lá e as D-12 (contador no cliente) e D-13 (teto do texto) novas | o usuário pediu o plano da discovery; a ordem 26 → 13 → 27 é a D-01 | discovery 09 (cabeçalho) e o índice das discoveries |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-10 | As features que algumas variantes sugerem (lista de slash commands, elicitação MCP, Files API, sugestões de prompt, `SessionStore`), o `tool_use_result` estruturado do MCP e o zoom do web (D-08) | a discovery as deixou fora ([§11](../../discovery/09-perdas-do-backend-na-conversa.md#11-fora-do-escopo)): as variantes ficam quietas com o motivo escrito | nenhum plano; voltam se a feature entrar |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | A linha `unknown` vira ruído | 🔲 aberto | contador (B-20, D-12) e o `never` da B-08 |
| R-02 | Texto de hook ou de comando com conteúdo sensível no replay e no celular | 🔲 aberto | corte e nunca o JSON (B-09, B-13, D-03); revisão de segurança no fim |
| R-03 | `includeSystemMessages` deixa o histórico lento | 🔲 aberto | medido na B-01; teto na B-16 |
| R-04 | A forma das mensagens muda numa versão do CLI | 🔲 aberto | fixtures gravadas (B-02) e `smoke-live` (B-27) |
| R-05 | Mudar "cliente ignora" quebra o app da loja | 🔲 aberto | a lista de calados na F1, antes da regra nova (D-02) |
| R-06 | A retirada remove a mensagem errada | 🔲 aberto | ids medidos (B-01, D-06); retirada idempotente (B-23) |
| R-07 | Sessões com MCP, skill, hook e comando rodam com as perdas entre o 13 e este plano | ✅ aceito | pela ordem (D-01); a D-11 já tirou da B-46 do 13 o que só este plano corrige |

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
