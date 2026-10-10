# Plano 12 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-10-10
**Bloqueios:** nenhuma decisão em aberto (as 13 decididas em 2026-09-26 e 2026-09-28, e a D-14 em 2026-10-10); o plano espera o 05 fechar ([06 · D-02](../06-workbench/decisions.md)). **Não** depende do [plano 28](../28-agent-neutral-core/README.md): só nasce com os nomes neutros dele ([D-14](decisions.md#d-14--ajuste-às-diretivas-do-plano-28))

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔄 em andamento
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-decision.md) | B-01…B-05 | 0/5 | 🔲 |
| [F1](F1-pty.md) | B-06…B-15 | 0/10 | 🔄 |
| [F2](F2-terminal-ui.md) | B-16…B-22 | 0/7 | 🔲 |
| [F3](F3-e2e.md) | B-23…B-26 | 0/4 | 🔲 |
| **Total** | **B-01…B-26** | **0/26** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 175 | 173 | 0 | 2 | 0 |

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
| 1 | 2026-09-27 | F1 · B-13 (antecipada) | 7 — cobertura, na raiz | `test/integration/scripts/run-e2e-local.spec.mjs` estourou o `afterAll` (10 min) contra o Docker, enquanto outra execução de e2e disputava o mesmo Docker; a cobertura dos workspaces nem rodou, por estar encadeada depois | nenhuma no código — sem relação com a mudança; a cobertura do backend rodou sozinha: 2432 testes, 100 % de funções, 99,72 % de linhas, 90 % por arquivo | portões 1–6 verdes; **portões 8–11 e `pnpm test:e2e:live` não rodaram, por decisão do usuário** — a task fica 🔄 |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-26 | A B-13 foi **antecipada**, com o plano ainda esperando o 05: o subprocesso do Claude passa a nascer sem a configuração do backend (`claudeEnvironment`), e o `realQueryFactory` recusa `env` ausente ou com variável do backend | o vazamento da senha do banco para qualquer `Bash` do Claude não podia esperar um plano travado por ordem; pedido do usuário | [D-10](decisions.md) ✅; [backend/04 · Ciclo de vida](../../architecture/backend/04-claude-integration.md#ciclo-de-vida-e-recursos); S-108, S-109 ✅; **S-110 pendente** (`smoke-live` não rodou) |
| 2026-10-10 | [D-14](decisions.md#d-14--ajuste-às-diretivas-do-plano-28): o plano segue sem esperar o 28, com nomes neutros — `agentPolicy` (nota na B-13, em andamento), a aba Saída pelo `kind: 'shell'`, o contexto do agente com `{agent}` | pedido do usuário: ajustar os planos não executados às diretivas do [plano 28](../28-agent-neutral-core/README.md) (isolamento, regras pelo dialeto, contrato canônico) | [README](README.md), B-07, B-13 (nota), B-18, B-19; S-140, S-148 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-26 | Tarefas (`package.json`, `Makefile`, `tasks.json`) e *problem matchers* | decisão do usuário: o terminal fica, as tarefas saem — registrada antes de o plano começar | lugar nenhum; opção B da D-01, descartada |
| 2026-09-26 | Qualquer dependência dos planos de depuração e de inteligência de linguagem | removidos do roteiro pelo usuário | — |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | O terminal fura a premissa do produto (permissão, allowlist, trilha por comando) | 🔲 aberto | é a D-01; nenhuma fase começa com ela aberta |
| R-02 | Ligar o terminal para outro usuário entrega a conta do SO do backend | 🔲 aberto | dito na ADR-017 e na ajuda; interruptor por `sub` em arquivo (D-08) |
| R-03 | Segredo do backend no ambiente do shell — e, hoje, no do subprocesso do Claude | 🔲 aberto | achado no planejamento (2026-09-26); B-07 e B-13, D-10 |
| R-04 | Shell sem dono: sobrevive à desconexão, ao shutdown ou ao `kill -9` | 🔲 aberto | mitigado no desenho da B-11; provado contando processos |
| R-05 | Tecla na trilha ou no log | 🔲 aberto | redação na B-05, antes do primeiro byte; S-105 |
| R-06 | `node-pty` quebra instalação e distribuição | 🔲 aberto | D-04; nota ao plano 19 |
| R-07 | Provedor sem `auth_time` no access token | 🔲 aberto | D-02; falha fechada |
| R-08 | Enxurrada de saída derruba a connection da sessão | 🔲 aberto | D-05 decidida: texto UTF-8 e fluxo no servidor; `bufferedAmount` medido na B-08 |
| R-09 | "Só do web" não é barreira contra quem tem as credenciais | 🔲 aberto | aceito e dito na D-09 |
| R-10 | Exposição fora do loopback torna o terminal alcançável pela internet | 🔲 aberto | nota ao plano 19 junto com a B-01 |

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
