# Plano 22 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano criado em 2026-10-04, a partir da [proposta](../../propostas/historico-ao-vivo-e-fiel.md)
**Última atualização:** 2026-10-05
**Bloqueios:** nenhum

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
| [F0](F0-norms.md) | B-01…B-05 | 0/5 | 🔲 |
| [F1](F1-mapping.md) | B-06…B-13 | 0/8 | 🔲 |
| [F2](F2-follower.md) | B-14…B-19 | 0/6 | 🔲 |
| [F3](F3-web-follow.md) | B-20…B-23 | 0/4 | 🔲 |
| [F4](F4-mobile-follow.md) | B-24…B-26 | 0/3 | 🔲 |
| [F5](F5-web-fidelity.md) | B-27…B-30 | 0/4 | 🔲 |
| [F6](F6-mobile-fidelity.md) | B-31…B-33 | 0/3 | 🔲 |
| [F7](F7-e2e.md) | B-34…B-37 | 0/4 | 🔲 |
| **Total** | **B-01…B-37** | **0/37** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 130 | 130 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 17 | 0 | 0 | 17 | 0 |

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
| 2026-10-04 | Abrir a imagem do prompt sob demanda ([D-09](decisions.md#f1--mapeamento-e-leituras)) | escolha do usuário, contra a recomendação (só o marcador) | rota nova da B-12, D-10, B-30, B-33, S-29…S-34, S-118…S-122, R-08 |
| 2026-10-04 | Pensamento resumido à vista ([D-15](decisions.md#f5--fidelidade-no-web)) | escolha do usuário; revê a D-17 do plano 08 | B-03, B-27, B-31, S-102 |
| 2026-10-04 | O e2e faz a conversa crescer pela porta do store roteirizado ([D-17](decisions.md#f7--e2e)) | o agente diverge da proposta: o backend do e2e substitui o `TRANSCRIPT_SDK`, e o SDK real já é provado na integração | B-34, S-123 |
| 2026-10-04 | `blockId` = `<uuid>:<índice>` no histórico ([D-06](decisions.md#f1--mapeamento-e-leituras)) | a proposta dizia só `uuid`, que não distingue os blocos de um prompt com imagem | B-06, S-08, S-09 |

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
| R-01 | O SDK muda a forma de `SessionMessage` | 🔲 aberto | — |
| R-02 | Transcript muito grande torna a releitura cara | 🔲 aberto | medido na B-19 |
| R-03 | Compactação ou rewind reescreve a cadeia | 🔲 aberto | — |
| R-04 | `working` inferido errado | 🔲 aberto | — |
| R-05 | Assinaturas órfãs | 🔲 aberto | — |
| R-06 | Ordem "corrigida" pelos timestamps | 🔲 aberto | — |
| R-07 | `blockId` muda a deduplicação da sessão viva | 🔲 aberto | — |
| R-08 | Rotas de saída e de imagem expõem conteúdo | 🔲 aberto | — |
| R-09 | Plano 10 mexe nos mesmos widgets do app | 🔲 aberto | conferir antes da F6 |
| R-10 | Outras sessões na mesma árvore | 🔲 aberto | — |

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
