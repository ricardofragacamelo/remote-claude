# Protocolo de validação

A [Definition of Done](10-definition-of-done.md) diz **o que precisa estar verde**.
Este documento diz **como executar até chegar lá**.

Aplica-se a qualquer unidade de trabalho: uma fase do projeto, uma task ou um PR. Daqui em
diante, "fase".

Voltar para o [índice transversal](README.md).

---

## O ciclo

```
  ┌───────────────────────────────────────────────────────────┐
  │                                                           │
  ▼                                                           │
ESTÁGIO 0 — Plano + matriz de cenários   ◄── não começa sem    │
  │                                                           │
  ▼                                                           │
ESTÁGIO 1 — Implementação + testes dos cenários               │
  │                                                           │
  ▼                                                           │
ESTÁGIO 2 — Portões, do mais barato ao mais caro              │
  │                                                           │
  ├── algum vermelho? ──► ESTÁGIO 3 — Corrigir ───────────────┘
  │                        (reinicia do PRIMEIRO portão)
  │
  └── todos verdes ──► ESTÁGIO 4 — Fechamento (DoD) ──► PRONTO
```

**A regra que dá nome ao protocolo:** achou erro, corrige e **repete desde o primeiro
portão**. Não se retoma de onde parou.

---

## Estágio 0 — Plano e matriz de cenários

**Nenhuma linha de código antes disto.**

Ao definir uma fase, uma task ou um plano, a saída obrigatória inclui uma **matriz de
cenários**. Não é "lista de testes a escrever depois": é parte do plano, e o plano não está
pronto sem ela.

### Por que antes

Cenário enumerado **depois** do código é cenário enviesado: você escreve o teste que o código
que você acabou de escrever passa. Enumerado antes, ele descreve o comportamento desejado — e
é aí que aparecem os casos que você não tinha pensado em implementar.

É também o que faz a cobertura ser consequência, e não uma corrida atrás de número no fim.

### O formato

| ID | Cenário | Dimensão | Nível | Erro esperado | Estado |
|---|---|---|---|---|---|
| S-01 | resolve permissão dentro do prazo | feliz | integração | — | ⬜ |
| S-02 | resolve com `requestId` repetido → uma execução | idempotência | unit | — | ⬜ |
| S-03 | ninguém responde até `expiresAt` | fronteira | integração | `PERMISSION_REQUEST_EXPIRED` | ⬜ |
| S-04 | dois clientes resolvem juntos → vence o primeiro | concorrência | e2e | — | ⬜ |
| S-05 | resolve request inexistente | erro | unit | `PERMISSION_REQUEST_NOT_FOUND` | ⬜ |
| S-06 | resolve após a sessão fechar | transição | integração | `SESSION_NOT_FOUND` | ⬜ |

Regras da matriz:

1. **Percorra as seis dimensões** para cada unidade —
   [como enumerar cenários](06-testing-strategy.md#como-enumerar-cenários). Dimensão sem
   nenhum cenário precisa de justificativa escrita, não de omissão.
2. **Todo cenário tem nível atribuído** (unit / integração / e2e). Ver
   [todo entregável gera os três níveis](06-testing-strategy.md#todo-entregável-gera-os-três-níveis).
3. **Todo caminho de erro vira cenário**, com o `code` esperado do
   [catálogo](04-errors-and-http.md). É a dimensão que a cobertura de `branches` cobra.
4. **A matriz é versionada junto com a fase**, em `docs/plans/<fase>/scenarios.md`.
5. Cenário descoberto durante a implementação **entra na matriz**, não vira teste órfão.

### Portão 0

O plano não é aprovado sem a matriz. Se a matriz tem só caminho feliz e um erro genérico, ela
parou na primeira dimensão — faltam cinco.

---

## Estágio 1 — Implementação

Implementa o que a fase pede **e** os testes de todos os cenários da matriz. Marcar `S-0x`
como coberto é parte de terminar o estágio, não do estágio seguinte.

Nada aqui dispensa as regras de sempre: camadas, idioma, i18n, logging, erros. Ver
[AGENTS.md](../../../AGENTS.md).

---

## Estágio 2 — Os portões

Ordem **obrigatória**: do mais barato ao mais caro. O objetivo é falhar em 5 segundos, não em
8 minutos.

| # | Portão | Comando | O que pega |
|---|---|---|---|
| 1 | Formatação | `pnpm format:check` | estilo |
| 2 | Lint | `pnpm lint` | regra sintática, `console.log`, literal na UI |
| 3 | Tipagem | `pnpm typecheck` | `any`, `dynamic`, tipo quebrado |
| 4 | Arquitetura | `pnpm lint:arch` | Dependency Rule, import cruzado, SDK vazando |
| 5 | Duplicação | `pnpm lint:dup` | [linhas repetidas](09-code-quality.md#linhas-repetidas) |
| 6 | Unit | `pnpm test:unit` | regra e caminho de erro |
| 7 | Cobertura | `pnpm test:coverage` | **90 % nas 4 dimensões, por arquivo** |
| 8 | Integração | `pnpm test:integration` | SQL real, gateway real, adapters |
| 9 | E2E | `pnpm test:e2e` | fluxo pela porta do usuário |
| 10 | Segurança | `pnpm scan:security` | segredo, dependência vulnerável, padrão inseguro |
| 11 | Contrato & i18n | `pnpm contracts:check && pnpm i18n:check` | contrato dessincronizado, chave faltando |
| 12 | Quality gate | SonarQube (CI) | complexidade, smell, hotspot |

Atalhos:

```bash
pnpm verify        # portões 1-7   — o ciclo rápido, use durante a implementação
pnpm verify:full   # portões 1-11  — o que define "pronto"
```

**Leia a saída.** Comando que "rodou" mas cuja saída não foi lida não conta como portão
executado. Exit code 0 é o mínimo, não a evidência.

---

## Estágio 3 — Loop de correção

Portão vermelho → corrige → **volta ao portão 1**.

### Por que reiniciar tudo

Porque correção quebra portão anterior, e isso acontece o tempo todo:

- corrigir lint extraindo uma função → muda complexidade e duplicação;
- corrigir um teste → altera código que passa a violar a Dependency Rule;
- adicionar um teste → derruba a cobertura de outro arquivo tocado;
- extrair código repetido → cria import cruzado entre features.

Retomar do portão que falhou deixa passar exatamente essas regressões — e elas só aparecem no
CI, depois do push.

### Regras do loop

1. **Uma causa por vez.** Corrija a causa do vermelho, não os sintomas em lote. Correção em
   massa torna impossível saber o que consertou o quê.
2. **Corrija a causa, não o sintoma.** Teste falhando porque a regra está errada se corrige na
   regra, não no `expect`.
3. **Registre cada ciclo**: o que falhou, o que foi feito. Isso vai para o relatório final.
4. **Regressão é sinal, não chateação.** Portão que estava verde e ficou vermelho significa
   que a última correção foi errada — volte nela, não contorne o portão.

### O que é terminantemente proibido para "passar"

Estas ações não tornam a fase pronta; tornam o portão inútil:

- desativar ou afrouxar regra de lint;
- reduzir limiar de cobertura, ou excluir arquivo da medição;
- marcar teste como `skip`, `todo` ou comentá-lo;
- trocar assertion por uma mais fraca para o teste passar;
- adicionar `@ts-ignore`, `// ignore:` ou supressão sem justificativa;
- excluir arquivo da análise de duplicação ou de segurança.

Se uma regra parece genuinamente errada, isso é uma [ADR](00-decisions.md) — uma conversa,
não uma edição de config no meio de uma correção.

### Critério de parada

O loop **não é infinito**. Se após **3 ciclos completos** o mesmo portão continua vermelho sem
progresso mensurável:

1. **Pare.**
2. Relate: qual portão, qual erro exato, o que foi tentado em cada ciclo, e qual a hipótese.
3. Escale para decisão humana.

Insistir além disso costuma significar que o problema é de desenho ou de premissa — e mais
iterações produzem contorno, não solução.

---

## Automação: script, não orquestração pelo agente

**Tarefa repetitiva vira script em `scripts/`. O agente invoca o script e lê a saída — não
reexecuta os passos um a um.**

### Por quê

Um agente que orquestra doze comandos, interpreta doze saídas e decide o próximo passo gasta
contexto e tokens a cada ciclo — e o ciclo de correção do
[Estágio 3](#estágio-3--loop-de-correção) repete isso muitas vezes. Pior: o resultado varia
conforme o que o agente lembrou de rodar naquela iteração.

Um script resolve os dois problemas de uma vez:

| | Agente orquestrando | Script |
|---|---|---|
| Custo por ciclo | doze idas e voltas | uma |
| Determinismo | varia com o que o agente lembrou | idêntico sempre |
| Fora do agente | não roda | a pessoa roda igual, e o CI também |
| Revisável | não — vive no histórico da conversa | sim, está versionado |

O terceiro item é o decisivo: **o que só o agente sabe fazer não existe para o resto do
time**. Um portão que depende de um agente lembrar da sequência não é um portão.

### A regra prática

Se você se pegar executando a mesma sequência de comandos **pela segunda vez**, ela vira
script. Não na terceira: na segunda.

Dois sinais de que passou da hora:
- você está encadeando comandos com `&&` e lendo cada saída para decidir o próximo;
- você escreveu um `python3 - <<'PY'` inline para conferir alguma coisa.

### Como escrever

- `.mjs` em `scripts/`, executado direto pelo `node`, sem build — ver
  [o plano de bootstrap](../../plans/00-bootstrap/README.md#por-que-mjs-e-não-ts-nos-scripts).
- Utilidade compartilhada em `scripts/lib/`. Dois scripts com o mesmo trecho é exatamente o
  que o portão de [linhas repetidas](09-code-quality.md#linhas-repetidas) pega.
- **Código de saída honesto**: 0 só quando passou. Script que sempre sai 0 torna o portão
  decorativo.
- **Saída legível por humano e por agente**: diga o que falhou e onde, não só que falhou.
- Idempotente, e com cleanup que roda mesmo em erro.

### O catálogo

Está em [scripts/README.txt](../../plans/00-bootstrap/README.md#catálogo-de-scripts) e é
mantido ali. Script novo entra no catálogo na mesma entrega — script que ninguém encontra
será reescrito por outra pessoa daqui a um mês.

---

## Estágio 4 — Fechamento

Todos os portões verdes:

1. Percorra o checklist da [Definition of Done](10-definition-of-done.md).
2. Confirme que **toda** linha da matriz de cenários está coberta e marcada.
3. Atualize contrato, catálogo de erros, ADR e documentos de arquitetura afetados.
4. Rode `pnpm verify:full` **uma última vez**, limpo.
5. Relate.

### O relatório

Obrigatório, e honesto:

- o que foi implementado;
- matriz de cenários, com o estado de cada linha;
- quantos ciclos de correção, e o que falhou em cada um;
- **o que ficou de fora e por quê** — escopo reduzido é decisão a comunicar, nunca a omitir;
- nível de teste que genuinamente não se aplicou, com a razão.

Relatório que omite falha é pior que a falha: remove a chance de alguém corrigi-la.

---

## Para o agente de IA

Resumo operacional:

1. **Planejou? Gere a matriz de cenários antes de codar.** Seis dimensões, todo caminho de
   erro incluído.
2. **Implementou? Rode `pnpm verify`.** Não anuncie nada antes disso.
2b. **Repetiu uma sequência de comandos? Vire script.** Na segunda vez, não na terceira.
3. **Vermelho? Corrija e rode desde o portão 1.** Não retome do meio.
4. **Verde no `verify`? Rode `pnpm verify:full`.** É o que define pronto.
5. **Três ciclos sem progresso? Pare e escale.** Não contorne portão.
6. **Nunca desative uma regra para passar.** Isso não é entregar; é esconder.
7. **Relate com honestidade**, incluindo o que não foi feito.
