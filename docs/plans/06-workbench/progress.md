# Plano 06 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-28
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
| [F1](F1-directory-browse.md) | B-06…B-12, B-40 | 0/8 | 🔲 |
| [F2](F2-open-folder.md) | B-13…B-16 | 0/4 | 🔲 |
| [F3](F3-layout.md) | B-17…B-22 | 0/6 | 🔲 |
| [F4](F4-commands.md) | B-23…B-27 | 0/5 | 🔲 |
| [F5](F5-screens.md) | B-28…B-34 | 0/7 | 🔲 |
| [F6](F6-e2e.md) | B-35…B-39 | 0/5 | 🔲 |
| **Total** | **B-01…B-40** | **0/40** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 182 | 182 | 0 | 0 | 0 |

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
| 2026-09-26 | F3 (layout) dividida em três fases: F3 moldura e casca, F4 comandos e notificações, F5 telas separadas; o e2e passou a F6 | cada parte é um ciclo de validação próprio, com outra superfície de teste | fases F3…F6, `F4-e2e.md` renomeado para `F6-e2e.md` |
| 2026-09-26 | Paridade com o VS Code restrita à de arquivos (decisão do usuário) | "não precisamos de tudo do VS Code" | saíram editor de atalhos, vários temas, zen mode, layout configurável, menu completo (fica o Arquivo), walkthrough e a confiança da pasta (servia a planos removidos) |
| 2026-09-26 | Chat do Claude e arquivos/editor na mesma aba, lado a lado (decisão do usuário) | o chat não é tela própria | B-21, B-22, B-33, S-116, S-117, S-150 |
| 2026-09-28 | As 14 decisões em aberto fechadas pelo usuário, em perguntas uma a uma; dez seguem a recomendação | as fases dependiam delas para começar | [decisions.md](decisions.md) D-04…D-17 |
| 2026-09-28 | Rotas `/sessions/$id`, `/history` e `/history/$conversationId` removidas neste plano, sem deep link (D-07, contra a recomendação) | escolha de navegação do usuário, que aceitou o histórico fora do web até o plano 08 | B-05, B-33, B-39, S-06, S-150, S-163; specs `history-and-resume` e `commands-and-undo` migram na B-33; [plano 08](../08-claude-panel/decisions.md) ganhou a D-24 |
| 2026-09-28 | Histórico de notificações no servidor: 30 dias, teto de 200, "lida" sincronizada (D-17, contra a recomendação) | o usuário quer reencontrá-lo em outro dispositivo | nova B-40 na F1, B-03, B-04, B-26, S-131, S-132, S-167…S-178, S-182 |
| 2026-09-28 | Aba inativa: sessões e terminais continuam anexados (D-11, híbrido) | resolve a divergência com os planos 08 e 10 | B-20, S-108, S-181; D-11 do plano 08 fechada; nota do plano 10 · B-16 |
| 2026-09-28 | Recarga da allowlist só por `SIGHUP`; o watch do arquivo foi considerado e descartado (D-15) | manter a regra "recarga explícita" de backend/03 | B-11, S-62, S-179, S-180 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-26 | Redesenho da Auditoria e das Regras | têm plano próprio | planos [12](../12-audit-explained/README.md) e [13](../13-rules-management/README.md) |
| 2026-09-26 | Profundidade de Dispositivos e de Logs e diagnóstico | têm plano próprio | planos [15](../15-devices/README.md) e [16](../16-logs-and-diagnostics/README.md) |
| 2026-09-26 | Seção "Claude" das Configurações | configuração do Claude é tela própria | plano [11](../11-claude-settings/README.md) |
| 2026-09-26 | Editor de atalhos, vários temas, zen mode, layout configurável, menu completo, walkthrough | decisão do usuário: paridade é a de arquivos | fora do produto |
| 2026-09-28 | Ler, continuar e desfazer conversa antiga pelo web (hoje em `/history`), e os cenários de e2e do web que só entravam por lá | decisão do usuário (D-07): as rotas antigas saem sem deep link | plano [08](../08-claude-panel/README.md), view Sessões; o app continua com o histórico |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Listagem de pastas vira um mapa da máquina | 🔲 aberto | mitigação nas B-06…B-08, D-03, D-04 |
| R-02 | Cópia local da allowlist afrouxa a fronteira | 🔲 aberto | mitigação na B-10, D-09 |
| R-03 | Estado vazando entre abas de pasta | 🔲 aberto | mitigação nas B-20, B-33 |
| R-04 | Plano grande — sete fases | 🔲 aberto | escopo cortado pela decisão do usuário; corte extra se registra aqui |
| R-05 | Abas inativas consomem memória e anexos | 🔲 aberto | D-11 decidida (sessões e terminais anexados, teto 8); falta medir a memória por aba |
| R-06 | Atalhos que o navegador não entrega | 🔲 aberto | D-16 decidida; falta medir nos três navegadores |
| R-07 | Deep links de hoje quebrados pela moldura | 🔲 aberto | S-06, S-91, S-163; os de sessão e histórico saem por decisão (D-07) |
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
