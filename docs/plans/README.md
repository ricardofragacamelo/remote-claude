# Planos — índice e formato normativo

Cada plano é uma unidade de trabalho com escopo fechado, rastreio e critério de conclusão
verificável. Executado sob o
[protocolo de validação](../architecture/shared/11-validation-protocol.md).

**Este documento define o formato obrigatório de todo plano.** Plano novo segue esta
estrutura — não é sugestão.

Voltar para o [índice geral](../architecture/README.md).

---

## Planos

| # | Plano | Estado | Critério de conclusão |
|---|---|---|---|
| 00 | [Bootstrap](00-bootstrap/README.md) | ✅ concluído | `pnpm verify:full` saiu com código 0, com um e2e atravessando todas as camadas |
| 01 | [Sessão viva](01-live-session/README.md) | ✅ concluído | `pnpm verify:full` **e** `pnpm test:e2e:live` saíram com código 0 |
| 02 | [Aprovação pelo celular](02-mobile-approval/README.md) | ✅ concluído | `pnpm verify:full` **e** `pnpm test:e2e:mobile` saíram com código 0 |
| 03 | [Regras e trilha](03-rules-and-audit/README.md) | ✅ concluído | `pnpm verify:full` saiu com código 0 |
| 04 | [Histórico e retomada](04-transcript-and-resume/README.md) | ✅ concluído | `pnpm verify:full` **e** `pnpm test:e2e:live` saíram com código 0 |
| 05 | [Endurecimento e operação](05-hardening-operations/README.md) | ✅ concluído | `pnpm verify:full` **e** `pnpm test:e2e:live` saem com código 0 |
| 06 | [Workbench](06-workbench/README.md) | ✅ concluído | `pnpm verify:full` sai com código 0 |
| 07 | [Explorer e editor](07-explorer-and-editor/README.md) | ✅ concluído | `pnpm verify:full` **e** `pnpm test:e2e:mobile` saem com código 0 |
| 08 | [Painel do Claude](08-claude-panel/README.md) | ✅ concluído | `pnpm verify:full`, `pnpm test:e2e:mobile` **e** `pnpm test:e2e:live` saem com código 0 |
| 09 | [Layout do chat](09-chat-layout/README.md) | ✅ concluído | `pnpm verify:full` sai com código 0 |
| 10 | [Layout do chat no app](10-mobile-chat-layout/README.md) | ✅ concluído | `pnpm verify:full` **e** `pnpm test:e2e:mobile` saem com código 0 |
| 11 | [Busca](11-search/README.md) | 🔲 não iniciado | `pnpm verify:full` sai com código 0 |
| 12 | [Terminal integrado](12-integrated-terminal/README.md) | 🔄 em andamento | `pnpm verify:full`, `pnpm test:e2e:mobile` **e** `pnpm test:e2e:live` saem com código 0 |
| 13 | [Configuração do Claude](13-claude-settings/README.md) | 🔄 em andamento | `pnpm verify:full`, `pnpm test:e2e:mobile` **e** `pnpm test:e2e:live` saem com código 0 |
| 14 | [Auditoria explicada](14-audit-explained/README.md) | 🔲 não iniciado | `pnpm verify:full` sai com código 0 |
| 15 | [Gestão de regras](15-rules-management/README.md) | 🔄 em andamento | `pnpm verify:full` sai com código 0 |
| 16 | [Uso e custo](16-usage-and-cost/README.md) | 🔲 não iniciado | `pnpm verify:full` sai com código 0 |
| 17 | [Dispositivos](17-devices/README.md) | 🔄 em andamento | `pnpm verify:full` **e** `pnpm test:e2e:mobile` saem com código 0 |
| 18 | [Logs e diagnóstico](18-logs-and-diagnostics/README.md) | 🔲 não iniciado | `pnpm verify:full` sai com código 0 |
| 19 | [Distribuição](19-distribution/README.md) | 🔲 não iniciado | `pnpm verify:full` **e** `pnpm dist:verify` saem com código 0 |
| 20 | [Dev public](20-dev-public/README.md) | 🔄 em andamento | `pnpm verify:full` sai com código 0 |
| 21 | [Rich previews](21-rich-previews/README.md) | ✅ concluído | `pnpm verify:full` sai com código 0 |
| 22 | [Histórico ao vivo](22-live-history/README.md) | ✅ concluído | `pnpm verify:full` **e** `pnpm test:e2e:mobile` saem com código 0 |
| 23 | [Permissões fluidas](23-fluid-permissions/README.md) | ✅ concluído | `pnpm verify:full` **e** `pnpm test:e2e:mobile` saem com código 0 |
| 24 | [Perguntas estruturadas](24-structured-questions/README.md) | ✅ concluído | `pnpm verify:full` sai com código 0 |
| 25 | [Navegador de arquivos no app](25-mobile-file-browser/README.md) | ✅ concluído | `pnpm verify:full` **e** `pnpm test:e2e:mobile` saem com código 0 |
| 26 | [Paridade da conversa no app](26-mobile-conversation-parity/README.md) | 🔲 não iniciado | `pnpm verify:full`, `pnpm test:e2e:mobile` **e** `pnpm test:e2e:live` saem com código 0 |

Legenda: 🔲 não iniciado · 🔄 em andamento · ✅ concluído · ⛔ bloqueado

A ordem é **dependência**, não preferência: cada plano pressupõe o anterior, como as fases
dentro de um plano. A exceção declarada são os planos **06 a 18** — o cliente no molde do VS Code,
criados em 2026-09-26: começam depois que o **05** fechar, e não dependem da distribuição
([06 · D-02](06-workbench/decisions.md)), e cada um diz no seu README de quais outros depende.
O **09** ([Layout do chat](09-chat-layout/README.md)) entrou em 2026-10-02, depois do 08, por pedido do
usuário: refaz a disposição do painel do Claude no molde do plugin do VS Code, e os planos que eram
09…18 passaram a 10…19 na mesma data. O **10** ([Layout do chat no app](10-mobile-chat-layout/README.md))
entrou no mesmo dia, depois do 09: leva o mesmo molde ao app Flutter, com paridade com o painel web, e
os planos que eram 10…19 passaram a 11…20 pelo `pnpm plan new --at 10`.
A **distribuição** ([19](19-distribution/README.md)) é o último plano: empacota o produto que os
anteriores entregam, e foi movida para o fim em 2026-09-27, por decisão do usuário — há muito a
resolver antes de empacotar.
Quanto já foi feito, em todos eles, está no
[progresso geral](progress.md) — esta tabela é o índice, não o diário.

---

## Formato obrigatório

### Estrutura de arquivos

```
docs/plans/
├── README.md              este documento: o índice e o formato
├── progress.md            ← o PROGRESSO GERAL, somando todos os planos
└── <nn>-<nome>/
    ├── README.md          o plano: objetivo, escopo, índice das fases, RASTREIO
    ├── scenarios.md       a matriz de cenários de teste
    ├── decisions.md       as decisões em aberto e os gaps, POR FASE
    ├── progress.md        o progresso e o histórico de validação DESTE plano
    ├── F0-<nome>.md       ← UMA FASE POR ARQUIVO
    ├── F1-<nome>.md
    └── F<n>-<nome>.md
```

Dentro do plano: **quatro** arquivos fixos, mais **um arquivo por fase**. Fora dele, um único
[progresso geral](progress.md), que todo plano mantém.

### As quatro regras estruturais

1. **Plano é dividido em fases.** Fase é a unidade do ciclo de validação: implementa, roda os
   portões, corrige, repete até verde. Só então começa a próxima.
2. **Cada fase é um arquivo separado**, e contém **várias tasks**. Fase não mora no `README.md`
   do plano — lá fica só o índice.
3. **Toda task tem ID** e aparece no rastreio. Trabalho sem ID não é rastreável e, na prática,
   não é verificável.
4. **Todo plano termina com a fase de E2E, e ela é sempre a última.** Fase nova entra **antes** dela,
   e a de E2E é renumerada para o fim — arquivo, índice do `README.md`, `progress.md` e as referências
   a ela. É ao fim dela que o portão completo roda
   ([ADR-023](../architecture/shared/00-decisions.md#adr-023--portão-rápido-por-fase-portão-completo-no-fim-do-plano)).
   `pnpm plan new` cria o plano com a fase `e2e` no fim. Planos concluídos antes desta regra ficam
   como estão.

**Por que uma fase por arquivo:** a fase é o que se carrega para trabalhar. Mantê-la num
arquivo próprio permite ao agente (e à pessoa) ler só o que a tarefa exige, em vez de um
documento de 800 linhas onde 90 % é contexto de outra fase. É a mesma lógica de progressive
disclosure que rege [docs/architecture](../architecture/README.md).

---

## O que cada arquivo contém

### `README.md` — o plano

| Seção | Conteúdo |
|---|---|
| Objetivo | uma frase |
| **Critério de conclusão** | **um comando**, não uma opinião |
| Por quê | a justificativa da abordagem |
| Escopo | o que entra **e o que deliberadamente não entra** |
| **Fases** | tabela-índice: fase → arquivo → entrega → tasks → estado |
| **Rastreio** | requisito → tasks → documento normativo → cenários |
| Artefatos | a árvore resultante |
| Riscos | `R-nn`, com estado |
| Como executar | referência ao protocolo |

O `README.md` **não** contém o detalhe das tasks. Isso mora no arquivo da fase.

### `F<n>-<nome>.md` — uma fase

| Seção | Conteúdo |
|---|---|
| Cabeçalho | links para plano, cenários e progresso |
| Depende de | fases anteriores |
| Entrega | o que existe ao fim da fase |
| Por quê | quando a ordem da fase não for óbvia |
| **Tasks** | uma subseção `### B-nn — <título> <estado>` por task, com o suficiente para implementar |
| Cenários cobertos | os `S-nn` que a fase fecha |
| **Critério de conclusão** | o comando que prova a fase |

Task descreve **o que** e **por quê**, não cola o código. Detalhe normativo vive em
`docs/architecture` — a fase **aponta** para lá, não duplica.

**O estado da task fica no fim do título**, com o mesmo vocabulário da fase: 🔲 não iniciada ·
🔄 em andamento · ✅ concluída · ⛔ bloqueada. Sem marca, a task conta como 🔲 — ausência nunca
é lida como concluída.

É daqui que `pnpm plan progress` tira os contadores do `progress.md`. Marcar a task no arquivo
da fase, onde o trabalho acontece, e derivar o resto é o que impede o diário de divergir do
plano; contador mantido à mão é contador errado.

### `scenarios.md` — a matriz

Exigida pelo
[Estágio 0](../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários),
escrita **antes** do código.

| ID | Cenário | Dim | Nível | Erro esperado | Task | Estado |
|---|---|---|---|---|---|---|

Enumerada pelas **seis dimensões** — equivalência, fronteira, erro, transição de estado,
concorrência, idempotência. Dimensão sem cenário exige **justificativa escrita**, não omissão.

### `decisions.md` — as decisões em aberto e os gaps

Uma seção por fase, com a tabela do que **ainda não foi decidido** e do gap que impede decidir:

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|

Estado: 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro.

**Por que é arquivo fixo:** decisão que ninguém registra é decisão tomada por omissão — e um
plano construído sobre uma resposta que ninguém deu só revela o problema na implementação, onde
custa caro. Separá-la da fase também responde a outra pergunta, a que importa antes de começar:
*o que precisa ser decidido para esta fase poder começar?*

Regras:

1. **Decisão em aberto não impede planejar; impede começar a fase** que depende dela. Por isso a
   coluna **Bloqueia** aponta fase ou task, não "o plano".
2. **Ao decidir, a linha não é apagada:** vira ✅, com a data, a escolha e o efeito em
   **Resultado**. É esse rastro que evita redecidir o mesmo assunto seis meses depois.
3. **Decidir também atualiza o documento normativo** — ou abre uma
   [ADR](../architecture/shared/00-decisions.md), quando muda uma escolha de arquitetura.
   Decisão registrada só no plano é decisão que o resto do repositório não conhece.
4. **Fase sem decisão em aberto diz isso**, com uma linha própria. Silêncio não é ausência.
5. **Decisão que sobrevive ao fim do plano é movida**, com o destino dito — não fica aberta num
   plano concluído.
6. O contador de decisões sai daqui, por `pnpm plan progress`, para o
   [progresso do plano](00-bootstrap/progress.md) e para o [geral](progress.md).

Decisão **descoberta durante a execução** entra aqui; a mudança que ela causou no plano vai para
o `progress.md`. Uma é a escolha, a outra é o efeito.

### `progress.md` da raiz — o progresso geral

[`docs/plans/progress.md`](progress.md) responde a uma pergunta que nenhum plano responde
sozinho: **em que pé o projeto está**. Uma linha por plano — fases, tarefas, cenários e estado
—, mais o total, o que já foi entregue, as decisões em aberto que bloqueiam fase e o histórico
de marcos.

**Ele não substitui o `progress.md` do plano, e o plano não substitui ele.** Um é o diário
daquele trabalho; o outro é o mapa de todos.

Os contadores dos dois saem do **mesmo** comando, lidos das mesmas marcas de task e da mesma
coluna de estado: `pnpm plan progress` atualiza o do plano **e** o geral, na mesma execução — e a
coluna **Estado** do índice de planos, no topo deste documento, que ninguém mantém à mão. E
`pnpm plan new` já cria a linha do plano novo no índice e no progresso geral — plano fora do
mapa é plano que ninguém acompanha.

**Sem argumento, `pnpm plan progress` recalcula todos os planos**, e além dos contadores:

- reescreve a coluna de estado da tabela de fases do `README.md` de cada plano;
- põe a tabela "Por plano" do progresso geral na ordem dos números;
- gera a lista das decisões em aberto, entre `<!-- open-decisions:start -->` e
  `<!-- open-decisions:end -->`;
- só grava o que mudou além da data — a data diz quando os contadores **andaram**;
- **falha** quando o que é escrito à mão contradiz os contadores: plano sem linha na tabela do que cada
  plano entrega, plano concluído sem o marco "Plano NN … concluído" no histórico, "Fase corrente" que
  diz "não iniciado" com task feita, ou que não diz que o plano fechou quando todas as tasks fecharam.
  Os contadores são escritos assim mesmo; o texto é de quem escreve, e o comando não passa até ele
  concordar.

### `progress.md` do plano — o diário

Estado por fase, contagem de tasks, contagem de cenários, **histórico de ciclos de validação**,
decisões tomadas, escopo reduzido e acompanhamento de riscos.

Os **contadores** — barras, linha de cada fase, total e contagem de cenários — são gerados por
`pnpm plan progress` a partir dos arquivos de fase e do `scenarios.md`. O resto do arquivo é
escrito à mão e o comando não toca nele. Editar um contador à mão é trabalho que a próxima
execução descarta.

---

## Convenções de ID

| Prefixo | É | Exemplo |
|---|---|---|
| `F<n>` | fase | `F3` |
| `B-<nn>` | task (sequencial no plano inteiro, não reinicia por fase) | `B-23` |
| `S-<nn>` | cenário de teste | `S-41` |
| `D-<nn>` | decisão em aberto (sequencial no plano inteiro) | `D-03` |
| `R-<nn>` | risco | `R-02` |

`R-nn` e `D-nn` não são a mesma coisa: **risco** é o que pode dar errado e se mitiga; **decisão**
é a escolha que alguém precisa fazer. Quando um risco existe porque falta decidir, os dois se
citam.

IDs **nunca são reaproveitados**. Task removida mantém o número vago, com nota no
`progress.md` — reaproveitar ID quebra o rastreio de quem já citou o número.

---

## Regras

1. **Plano sem matriz de cenários não é plano.** É exigência do
   [Estágio 0](../architecture/shared/11-validation-protocol.md) do protocolo.
2. **O critério de conclusão é um comando.** "Está pronto" não é critério; `pnpm verify` saindo com 0
   fecha uma fase, e `pnpm verify:full` saindo com 0, depois da fase de E2E, fecha o plano.
3. **Fase só fecha com os portões verdes** — os do portão rápido. Ver
   [Definition of Done](../architecture/shared/10-definition-of-done.md).
4. **Escopo reduzido é decisão comunicada**, registrada no `progress.md` — nunca omissão.
5. **Plano é contrato, progresso é diário.** Não misture: plano que vira diário perde a função
   de contrato, e diário que vira plano perde a história.
6. **Documento normativo não se duplica no plano.** A fase aponta para
   `docs/architecture`; regra copiada é regra que diverge.
7. **Progresso de fase é registrado nos dois lugares.** Toda fase — ao começar, ao concluir uma
   task e ao fechar — atualiza o `progress.md` **do seu plano** e o
   [progresso geral](progress.md). Na prática isso é uma execução de `pnpm plan progress`, que
   escreve os dois; o que é escrito à mão (fase corrente, bloqueio, marco) vai em cada um, no
   seu nível.
8. **Plano sem `decisions.md` não é plano.** As decisões em aberto e os gaps, por fase, fazem
   parte da definição — e cada decisão tomada fica registrada ali, com data e efeito.
9. **Todo plano mantém o seu estado no progresso geral**, do primeiro dia ao último. Plano
   criado entra na tabela pelo `pnpm plan new`; plano que anda atualiza a linha pelo
   `pnpm plan progress`; plano concluído vira uma linha no histórico de marcos. **Contador
   editado à mão é contador que a próxima execução descarta.**
