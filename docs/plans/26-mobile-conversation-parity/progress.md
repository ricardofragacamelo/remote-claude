# Plano 26 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-10-09
**Bloqueios:** nenhum. Só a D-10 (motor de realce) está aberta, e sai do spike da F0 ([decisions.md](decisions.md)). Este plano **bloqueia** a F2 do [plano 13](../13-claude-settings/README.md), parada em 2026-10-09 ([D-01](decisions.md#normas))

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
| [F0](F0-spike.md) | B-01…B-03 | 0/3 | 🔲 |
| [F1](F1-parity-map.md) | B-04…B-06 | 0/3 | 🔲 |
| [F2](F2-shared-markdown.md) | B-07, B-08 | 0/2 | 🔲 |
| [F3](F3-message-markdown.md) | B-09…B-12 | 0/4 | 🔲 |
| [F4](F4-tool-cards.md) | B-13…B-17, B-32 | 0/6 | 🔲 |
| [F5](F5-subagents.md) | B-18…B-21 | 0/4 | 🔲 |
| [F6](F6-parity-gate.md) | B-27, B-28 | 0/2 | 🔲 |
| [F7](F7-e2e.md) | B-29, B-31 | 0/2 | 🔲 |
| **Total** | **B-01…B-21, B-27…B-29, B-31, B-32** | **0/26** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 78 | 78 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 13 | 1 | 0 | 12 | 0 |

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
| 2026-10-09 | Decididas pelo usuário: D-02 (markdown a cada delta), D-07 (chip de MCP só leitura no app, pelo plano 13), D-11 (link da trilha com lista filtrada; "inserir no editor" fora), D-12 (mapa em `scripts/`, portão 11); D-04…D-06 saem com a F6 | perguntas das decisões em aberto | F4 ganha a B-32; F6 removida; plano 13 ganha a D-32 |
| 2026-10-09 | Plano criado a partir da [discovery 08](../../discovery/08-paridade-da-conversa-no-app.md), antes da F2 do plano 13 (D-01) | o usuário pediu a paridade da conversa no app, no conteúdo e no formato (R4), e parou o plano 13 na F2 para este rodar antes | plano 13: README, F2, F4 (B-46), decisions (D-31) e progress |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-09 | A F6 "Perdas do backend" inteira: tasks B-22…B-26 e a B-30 (o e2e do web delas), cenários S-72…S-76, S-80, S-81 e S-85. Da F0, as sondas da B-01 que mediam perda do backend (mensagem sintética, `/comando`, hook, modelo reserva, resultado MCP com mídia), as fixtures `mcp-media-result-turn`, `skill-turn`, `project-command-turn`, `hook-message-turn` e `fallback-turn` da B-02 e os cenários S-01…S-04. Os IDs ficam vagos. A F7 e a F8 passaram a F6 e F7 | este plano só deixa o app igual ao web de hoje; as perdas do backend e todo desconhecido são da [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md) ([D-06](decisions.md#f0--spike)) | a [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Markdown malicioso no chat | 🔲 aberto | o renderizador do plano 25 (B-07, B-10) |
| R-02 | Conversa longa com muito markdown e diagramas trava o app | 🔲 aberto | medido na B-03; D-02 |
| R-03 | Mover o renderizador quebra o leitor do plano 25 | 🔲 aberto | testes do leitor sem edição (B-07) |
| R-04 | A forma das mensagens novas muda numa versão do CLI | 🔲 aberto | fixtures gravadas (B-02) e `smoke-live` (B-31) |
| R-05 | Subagent de subagent ilegível no celular | 🔲 aberto | a profundidade do web (B-19) |
| R-06 | O mapa vira lista de exclusões para passar | 🔲 aberto | exclusão só com decisão ✅ (B-05) |
| R-07 | O plano 13 retomar a F2 antes deste fechar | 🔲 aberto | dependência escrita no plano 13 |

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
