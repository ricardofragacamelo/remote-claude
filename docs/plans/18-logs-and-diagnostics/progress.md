# Plano 18 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-10-10
**Bloqueios:** o plano espera o [28 — Núcleo neutro de agente](../28-agent-neutral-core/README.md) concluído ([D-17](decisions.md#d-17--ajuste-às-diretivas-do-plano-28)); as decisões da F0 (D-02…D-09; a D-01 foi descartada) estão abertas e impedem **começar** a F0 — ver [decisions.md](decisions.md)

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-07 | 0/7 | 🔲 |
| [F1](F1-log-backend.md) | B-08…B-10, B-12…B-15 | 0/7 | 🔲 |
| [F2](F2-logs-screen.md) | B-16…B-23 | 0/8 | 🔲 |
| [F3](F3-health-screen.md) | B-24…B-31 | 0/8 | 🔲 |
| [F4](F4-e2e.md) | B-32…B-35 | 0/4 | 🔲 |
| **Total** | **B-01…B-10, B-12…B-35** | **0/34** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 116 | 116 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 17 | 14 | 0 | 3 | 0 |

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
| 2026-09-26 | O plano parte do código, não do roteiro: o plano 05 · F1 está **concluído**, a tela de diagnóstico dele é a do app (não há tela web a absorver), `diag` e `health` não estão no catálogo de módulos, e linha `debug` do cliente é descartada com o backend em `info` | verificado no planejamento, antes da primeira task | D-01, D-11, B-01, B-11 |
| 2026-09-27 | **O visualizador mostra só as linhas do backend.** As linhas do web e do app saem do plano: D-01 e D-11 descartadas; D-02 fica só com o operador, sem a metade "log de cliente é do dono" — o visualizador inteiro é do operador, e quem não é recebe a explicação; a redação por forma de texto, que o 05 removeu, passa a ser trabalho declarado deste plano, na leitura (B-03, B-13); toda exportação vai para a trilha (D-07); o "ver nos logs" aparece só para o operador | decisão do usuário: o envio de log do cliente ao backend não é necessário e saiu do código e do [plano 05](../05-hardening-operations/progress.md#escopo-reduzido-ou-adiado); o log do cliente fica no cliente, e o `traceId` liga um erro na tela às linhas do backend ([03-logging](../../architecture/shared/03-logging.md#por-quê-o-mesmo-schema-nas-três-pontas)) | [README](README.md), [decisions.md](decisions.md), [matriz](scenarios.md), B-01, B-03, B-04, B-08, B-13, B-14, B-17, B-18, B-20, B-21, B-23, B-30, B-32 |
| 2026-10-10 | [D-17](decisions.md#d-17--ajuste-às-diretivas-do-plano-28): o plano nasce sobre o núcleo neutro do 28 — um item de saúde por motor pelo `describe()` com `HEALTH_AGENT_*`, os checks e a sonda do Claude registrados pela extensão (`POST /engines/claude/diagnostics/probe`, `claude.diagnosticsProbed`), categoria por motor, `engine.*` nos logs e no rastreio | pedido do usuário: ajustar os planos não executados às diretivas do [plano 28](../28-agent-neutral-core/README.md) (isolamento, regras pelo dialeto, contrato canônico) | [README](README.md), B-02, B-05, B-06, B-07, B-18, B-20, B-23, B-26, B-28, B-29, B-31; D-14, D-15 (texto); S-39, S-100, S-101, S-104, S-110. 2026-10-10 (revisão dos gaps do 28): kind da sonda `engine.diagnosticsProbed` com o motor no payload (28 · D-10); rotas novas com tipo em `packages/contracts/schema/http/` (28 · D-09) — D-14, D-17, F0 (cabeçalho, B-05, B-06), F3 (B-26), S-104 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-27 | B-11 (as linhas do cliente no buffer, com o nível delas); S-26…S-30 (linhas do cliente), S-36 e S-37 (isolamento por dono), S-76 (estado do envio do `LogBuffer` do web); a fonte `web`/`app` no filtro, nas facetas e no registro, e o `scope: own` da consulta; o envio opcional em desenvolvimento (`VITE_LOG_SHIP`) da D-12; R-07 encerrado | decisão do usuário: o log do web e do app fica no console de cada um, e não há mais linha de cliente chegando ao backend para ler. IDs ficam vagos, sem reaproveitamento | **a lugar nenhum** — removido junto com o envio de log do cliente no [plano 05](../05-hardening-operations/progress.md#escopo-reduzido-ou-adiado) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | A tela vira o vazamento: log de backend em `debug` atravessando a rede | 🔲 aberto | redação por forma na leitura (B-13), operador (D-02), S-31…S-34, S-117 |
| R-02 | Laço de amplificação: a consulta logada entra no buffer e é lida de novo | 🔲 aberto | rotas `diagnostics` logam só metadados (B-10, S-25) |
| R-03 | Append lento atrasa toda linha do backend — e a sessão junto | 🔲 aberto | append síncrono e constante, falha contida (S-24, S-46) |
| R-04 | O buffer some no reinício, justo depois de um crash | 🔲 aberto | declarado na tela; persistir vai para o plano 19 (D-03) |
| R-05 | Nível elevado esquecido | 🔲 aberto | prazo obrigatório e volta no reinício (D-06, D-12) |
| R-06 | A sonda ativa do Claude consome o plano do dono da máquina | 🔲 aberto | só operador, uma por vez, auditada (D-14) |
| R-07 | Linha `debug` do cliente descartada com o backend em `info` — medido no código | ✅ encerrado | 2026-09-27: as linhas do cliente não chegam mais ao backend; D-11, B-11 e S-26 saíram |

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
