# Plano 07 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-28
**Bloqueios:** nenhum para planejar; para **começar**, o plano 06 concluído. As decisões de F0 estão tomadas; a D-08 (watcher) fecha com o spike B-19, que é a primeira tarefa da F3 — ver [decisions.md](decisions.md)

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F7 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F8 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-06 | 0/6 | 🔲 |
| [F1](F1-file-read.md) | B-07…B-10 | 0/4 | 🔲 |
| [F2](F2-file-write.md) | B-11…B-18 | 0/8 | 🔲 |
| [F3](F3-file-watch.md) | B-19…B-23 | 0/5 | 🔲 |
| [F4](F4-explorer.md) | B-24…B-30 | 0/7 | 🔲 |
| [F5](F5-editor.md) | B-31…B-42 | 0/12 | 🔲 |
| [F6](F6-e2e.md) | B-43…B-46 | 0/4 | 🔲 |
| [F7](F7-previews-and-transfer.md) | B-47…B-54 | 0/8 | 🔲 |
| [F8](F8-local-history.md) | B-55…B-61 | 0/7 | 🔲 |
| **Total** | **B-01…B-61** | **0/61** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 360 | 360 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 20 | 0 | 1 | 19 | 0 |

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
| 2026-09-26 | O plano ganhou as fases F7 (prévias e transferência) e F8 (histórico local), depois da F6 do núcleo | o usuário pediu paridade com o VS Code **nas funções de arquivo**; os arquivos de fase F0…F6 já existiam e não são renomeados, então as fases novas vêm depois do e2e do núcleo, cada uma com o seu próprio e2e | README, decisions (D-16…D-18), scenarios |
| 2026-09-26 | Inteligência de linguagem e depuração saíram do alcance, e o git saiu do plano 09 | decisão do usuário: "não vai ter debug, nem inteligência de linguagem"; o plano 09 ficou só com busca | README (Não entra), D-09, F8 (a Linha do tempo é só histórico local) |
| 2026-09-26 | A árvore e as abas viraram fonte de arraste para o chat do Claude (B-42) | pedido do usuário; o alvo é do plano 08 | F5, D-20 |
| 2026-09-28 | As 20 decisões em aberto respondidas pelo usuário, uma a uma; todas seguem a recomendação. 19 decididas; a D-08 tem o método (spike B-19) e espera a medida | as fases dependiam delas para começar | [decisions.md](decisions.md) D-01…D-20; nenhuma tarefa ou cenário mudou. Números de D-04, D-16 e o hard link da D-05 são provisórios até a medida |

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
| R-01 | Perda de trabalho entre o humano e o Claude no mesmo arquivo | 🔲 aberto | janela residual contra escritor externo declarada; D-03 |
| R-02 | Fuga de caminho por `..`, symlink ou troca entre checar e abrir | 🔲 aberto | verificação no descritor é Linux-only; D-05 |
| R-03 | Watcher esgota o inotify ou vaza | 🔲 aberto | medir na B-19; D-08, D-10 |
| R-04 | Editor pesado no celular, sem jsdom, ou com CDN | 🔲 aberto | medir antes de fechar a D-09 |
| R-05 | Contrato WS numa ponta só, `seq` fora de sessão | 🔲 aberto | D-07; o plano 10 reusa a regra |
| R-06 | Conteúdo de arquivo vazando para log, trilha, navegador ou URL | 🔲 aberto | S-61, S-116, D-14, D-16 |
| R-07 | Conteúdo do usuário executando na origem do produto | 🔲 aberto | D-18 |
| R-08 | Apagar sem volta | 🔲 aberto | D-06; resolvido para o que cabe no teto pela F8 |
| R-09 | Save rápido em arquivo que muda a permissão | 🔲 aberto | D-15, coordenado com o plano 11 |
| R-10 | Escrita no disco alcançável pela rede antes do plano 05 | 🔲 aceito | ordem da D-02 do plano 06 |

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
