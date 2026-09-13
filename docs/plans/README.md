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
| 00 | [Bootstrap](00-bootstrap/README.md) | 🔲 não iniciado | `pnpm verify:full` sai com código 0, com um e2e atravessando todas as camadas |

Legenda: 🔲 não iniciado · 🔄 em andamento · ✅ concluído · ⛔ bloqueado

---

## Formato obrigatório

### Estrutura de arquivos

```
docs/plans/<nn>-<nome>/
├── README.md          o plano: objetivo, escopo, índice das fases, RASTREIO
├── scenarios.md       a matriz de cenários de teste
├── progress.md        o progresso e o histórico de validação
├── F0-<nome>.md       ← UMA FASE POR ARQUIVO
├── F1-<nome>.md
└── F<n>-<nome>.md
```

Três arquivos fixos, mais **um arquivo por fase**.

### As três regras estruturais

1. **Plano é dividido em fases.** Fase é a unidade do ciclo de validação: implementa, roda os
   portões, corrige, repete até verde. Só então começa a próxima.
2. **Cada fase é um arquivo separado**, e contém **várias tasks**. Fase não mora no `README.md`
   do plano — lá fica só o índice.
3. **Toda task tem ID** e aparece no rastreio. Trabalho sem ID não é rastreável e, na prática,
   não é verificável.

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
| **Tasks** | uma subseção `### B-nn — <título>` por task, com o suficiente para implementar |
| Cenários cobertos | os `S-nn` que a fase fecha |
| **Critério de conclusão** | o comando que prova a fase |

Task descreve **o que** e **por quê**, não cola o código. Detalhe normativo vive em
`docs/architecture` — a fase **aponta** para lá, não duplica.

### `scenarios.md` — a matriz

Exigida pelo
[Estágio 0](../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários),
escrita **antes** do código.

| ID | Cenário | Dim | Nível | Erro esperado | Task | Estado |
|---|---|---|---|---|---|---|

Enumerada pelas **seis dimensões** — equivalência, fronteira, erro, transição de estado,
concorrência, idempotência. Dimensão sem cenário exige **justificativa escrita**, não omissão.

### `progress.md` — o diário

Estado por fase, contagem de tasks, contagem de cenários, **histórico de ciclos de validação**,
decisões tomadas, escopo reduzido e acompanhamento de riscos.

---

## Convenções de ID

| Prefixo | É | Exemplo |
|---|---|---|
| `F<n>` | fase | `F3` |
| `B-<nn>` | task (sequencial no plano inteiro, não reinicia por fase) | `B-23` |
| `S-<nn>` | cenário de teste | `S-41` |
| `R-<nn>` | risco | `R-02` |

IDs **nunca são reaproveitados**. Task removida mantém o número vago, com nota no
`progress.md` — reaproveitar ID quebra o rastreio de quem já citou o número.

---

## Regras

1. **Plano sem matriz de cenários não é plano.** É exigência do
   [Estágio 0](../architecture/shared/11-validation-protocol.md) do protocolo.
2. **O critério de conclusão é um comando.** "Está pronto" não é critério; `pnpm verify:full`
   saindo com 0 é.
3. **Fase só fecha com os portões verdes.** Ver
   [Definition of Done](../architecture/shared/10-definition-of-done.md).
4. **Escopo reduzido é decisão comunicada**, registrada no `progress.md` — nunca omissão.
5. **Plano é contrato, progresso é diário.** Não misture: plano que vira diário perde a função
   de contrato, e diário que vira plano perde a história.
6. **Documento normativo não se duplica no plano.** A fase aponta para
   `docs/architecture`; regra copiada é regra que diverge.
