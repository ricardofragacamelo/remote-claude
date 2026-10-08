# Plano 25 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado; a próxima é a F0, o spike dos motores
**Última atualização:** 2026-10-08
**Bloqueios:** nenhum. As decisões do usuário foram tomadas em 2026-10-08; D-02, D-09 e D-10 fecham com a captura e o spike, pelo critério que ele escolheu ([decisions.md](decisions.md))

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
| [F0](F0-spike.md) | B-01…B-04 | 0/4 | 🔲 |
| [F1](F1-norms.md) | B-05…B-08, B-32 | 0/5 | 🔲 |
| [F2](F2-panel.md) | B-09…B-13 | 0/5 | 🔲 |
| [F3](F3-text-viewer.md) | B-14…B-18 | 0/5 | 🔲 |
| [F4](F4-markdown.md) | B-19…B-22 | 0/4 | 🔲 |
| [F5](F5-pdf.md) | B-23…B-25 | 0/3 | 🔲 |
| [F6](F6-download.md) | B-26…B-28 | 0/3 | 🔲 |
| [F7](F7-e2e.md) | B-29…B-31 | 0/3 | 🔲 |
| **Total** | **B-01…B-32** | **0/32** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 153 | 153 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 24 | 3 | 3 | 18 | 0 |

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
| — | — | — | — |

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
| R-01 | Um pedido de permissão não notifica com o leitor aberto (já acontece com o histórico) | 🔲 aberto | B-08 na F1 conserta antes do leitor existir |
| R-02 | Arquivo grande trava o app ou estoura a memória | 🔲 aberto | medido no spike (B-01, B-03) |
| R-03 | O APK cresce com o PDFium e o motor do Mermaid | 🔲 aberto | medido no spike (B-01, B-02) |
| R-04 | Markdown malicioso: `javascript:`, imagem remota, HTML | 🔲 aberto | — |
| R-05 | A barra da sessão não comporta o quarto ícone | 🔲 aberto | D-02, com a captura |
| R-06 | O `pdfrx` não roda no `flutter test` | 🔲 aberto | conferido no spike (S-03) |
| R-07 | O ícone novo confunde com o das sessões | 🔲 aberto | D-03, com a captura |
| R-08 | O app mostra a pasta inteira num aparelho que pode ser perdido | 🔲 aberto | D-12 decidida: só aparelho aprovado lê (B-32) |
| R-09 | O token vence no meio de um download longo | 🔲 aberto | — |
| R-10 | Motor do Mermaid jovem ou pesado | 🔲 aberto | B-02 |
| R-11 | Um markdown com muitos diagramas trava o app | 🔲 aberto | — |
| R-12 | O diagrama sai diferente no web e no app | 🔲 aberto | D-20 |
| R-13 | Outra sessão na mesma árvore mexendo nos mesmos arquivos | 🔲 aberto | o plano 24 está aberto |
| R-15 | O guard recusa o próprio web, se o token do web vier sem `azp` | 🔲 aberto | S-148 e o e2e do web |
| R-14 | Um WebView no app contra a regra "WebView é proibida" (que é de login) | 🔲 aberto | só se a D-10 escolher o WebView |

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
