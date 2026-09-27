# Plano 06 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-27
**Bloqueios:** nenhum

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-05 | 0/5 | 🔲 |
| [F1](F1-directory-browse.md) | B-06…B-12 | 0/7 | 🔲 |
| [F2](F2-open-folder.md) | B-13…B-16 | 0/4 | 🔲 |
| [F3](F3-layout.md) | B-17…B-22 | 0/6 | 🔲 |
| [F4](F4-commands.md) | B-23…B-27 | 0/5 | 🔲 |
| [F5](F5-screens.md) | B-28…B-34 | 0/7 | 🔲 |
| [F6](F6-e2e.md) | B-35…B-39 | 0/5 | 🔲 |
| **Total** | **B-01…B-39** | **0/39** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 166 | 166 | 0 | 0 | 0 |

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
| 2026-09-26 | F3 (layout) dividida em três fases: F3 moldura e casca, F4 comandos e notificações, F5 telas separadas; o e2e passou a F6 | cada parte é um ciclo de validação próprio, com outra superfície de teste | fases F3…F6, `F4-e2e.md` renomeado para `F6-e2e.md` |
| 2026-09-26 | Paridade com o VS Code restrita à de arquivos (decisão do usuário) | "não precisamos de tudo do VS Code" | saíram editor de atalhos, vários temas, zen mode, layout configurável, menu completo (fica o Arquivo), walkthrough e a confiança da pasta (servia a planos removidos) |
| 2026-09-26 | Chat do Claude e arquivos/editor na mesma aba, lado a lado (decisão do usuário) | o chat não é tela própria | B-21, B-22, B-33, S-116, S-117, S-150 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-26 | Redesenho da Auditoria e das Regras | têm plano próprio | planos [12](../12-audit-explained/README.md) e [13](../13-rules-management/README.md) |
| 2026-09-26 | Profundidade de Dispositivos e de Logs e diagnóstico | têm plano próprio | planos [15](../15-devices/README.md) e [16](../16-logs-and-diagnostics/README.md) |
| 2026-09-26 | Seção "Claude" das Configurações | configuração do Claude é tela própria | plano [11](../11-claude-settings/README.md) |
| 2026-09-26 | Editor de atalhos, vários temas, zen mode, layout configurável, menu completo, walkthrough | decisão do usuário: paridade é a de arquivos | fora do produto |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Listagem de pastas vira um mapa da máquina | 🔲 aberto | mitigação nas B-06…B-08, D-03, D-04 |
| R-02 | Cópia local da allowlist afrouxa a fronteira | 🔲 aberto | mitigação na B-10, D-09 |
| R-03 | Estado vazando entre abas de pasta | 🔲 aberto | mitigação nas B-20, B-33 |
| R-04 | Plano grande — sete fases | 🔲 aberto | escopo cortado pela decisão do usuário; corte extra se registra aqui |
| R-05 | Abas inativas consomem memória e anexos | 🔲 aberto | D-11 — medir |
| R-06 | Atalhos que o navegador não entrega | 🔲 aberto | D-16 — medir |
| R-07 | Deep links de hoje quebrados pela moldura | 🔲 aberto | S-06, S-91, S-163 |
| R-08 | Planos 11–13 e 14–16 dependem dos registros deste | 🔲 aberto | registros documentados na F0 |

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
