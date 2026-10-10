# Plano 14 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-10-10
**Bloqueios:** nenhum para planejar. Para **começar**: o [plano 28](../28-agent-neutral-core/README.md) concluído (pela ordem de 2026-10-10, o 14 vem depois do 28, do 26 F2…F7, do 13 e do 27 — [D-15](decisions.md#d-15--o-núcleo-neutro-do-plano-28)); a F0 espera o plano 03 concluído e as decisões D-01…D-07 (a D-01 depende do spike da B-01); a F2 espera a moldura de tela e a navegação global do [plano 06](../06-workbench/README.md)

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
| [F0](F0-contract.md) | B-01…B-06 | 0/6 | 🔲 |
| [F1](F1-trail-backend.md) | B-07…B-15 | 0/9 | 🔲 |
| [F2](F2-trail-screen.md) | B-16…B-25 | 0/10 | 🔲 |
| [F3](F3-events-and-export.md) | B-26…B-34 | 0/9 | 🔲 |
| [F4](F4-e2e.md) | B-35…B-38 | 0/4 | 🔲 |
| **Total** | **B-01…B-38** | **0/38** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 152 | 152 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 15 | 14 | 0 | 1 | 0 |

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
| 2026-10-10 | O plano nasce sobre o núcleo neutro do [plano 28](../28-agent-neutral-core/README.md): o que é do Claude no adapter `engines/claude/`, a conversa como `engine` + `conversation_id`, a ferramenta pelo `kind`/`label`/`subject`, o diff e o alcance da regra pelo backend, `{agent}` no texto ([D-15](decisions.md#d-15--o-núcleo-neutro-do-plano-28)). 2026-10-10 (revisão dos gaps do 28): a regra é a da gramática canônica, e a parte que casou vem do domínio de `permission`, não do `RuleDialect`; os kinds de extensão são `engine.*`, com o motor no payload, nunca `claude.*`; as rotas novas nascem em `packages/contracts/schema/http/` | pedido do usuário: ajustar os planos não executados às diretivas de isolamento, de regras e de canonicidade do 28 | README (dependência, rastreio, árvore); B-01…B-03, B-06…B-10, B-12, B-16…B-21, B-25…B-29, B-31, B-34; D-04, D-08, D-09, D-13; S-21, S-41, S-52, S-65, S-72…S-75, S-112, S-123, S-124, S-131. Na revisão: [28 · D-09, D-10, D-11, D-18](../28-agent-neutral-core/decisions.md#f5--permissão-pelo-dialeto) contra a recomendação que o ajuste supôs; README (dependência, rastreio, árvore); B-03, B-06, B-26, B-29; D-15; S-124; nasce S-152 |

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
| R-01 | A migration toca a tabela mais protegida do produto | 🔲 aberto | só colunas anuláveis sem default, nenhum `UPDATE`, triggers intactas; S-14…S-16 |
| R-02 | O desfecho pode vazar conteúdo (`tool_response`, `stderr`) | 🔲 aberto | grava só status, duração e código; S-10 planta um segredo |
| R-03 | A exportação é superfície nova de vazamento | 🔲 aberto | ADR antes da task (B-30), teto, CSV neutralizado, exportação auditada |
| R-04 | Agregação sobre tabela que só cresce | 🔲 aberto | plano de execução com 100 mil linhas (S-36, S-67); medição da busca registrada aqui na B-14 |
| R-05 | Tentação de copiar o título da conversa para o banco | 🔲 aberto | lido na hora pelo `transcript`; `lint:arch` reprova (S-26) |
| R-06 | "Não concluiu" dito para tool que ainda roda | 🔲 aberto | estado da sessão viva perguntado na hora (D-05); S-32 |
| R-07 | Planos 06, 08, 15 e 17 escritos em paralelo | 🔲 aberto | cada vínculo tem caminho que funciona sem o outro plano; a moldura do 06 é dependência da F2 |

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
