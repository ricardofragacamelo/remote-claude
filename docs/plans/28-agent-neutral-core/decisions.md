# Plano 28 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

As D-01…D-16 vêm da [discovery 10 §13](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#13-decisões-em-aberto),
com os mesmos IDs, e a recomendação de lá está na coluna **Gap** enquanto a decisão está aberta. Da
D-17 em diante, nascem neste plano.

---

## F0 — Normas

Valem para o plano inteiro.

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | A ordem dos planos ([discovery §10](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#10-ordem-de-execução)) | — | o plano inteiro | 2026-10-10 · **a ordem A**: 26 · F1 (só falta o `pnpm verify`) → **28** → 26 · F2…F7 → 13 · F2…F4 → 27 → 15, 14, 16, 18 (cada um pela sua dependência) → os motores da discovery 03 → 19, o último. Os planos 11, 12, 17 e 20 não dependem deste. O usuário pediu "gravar as dependências entre os planos e a ordem que os planos têm que ser executados" ao gerar este plano, e parou o 26 na F1. Isso muda a ordem 26 → 13 → 27 de 2026-10-09: o 28 entra no meio do 26. A ordem fica escrita no [índice dos planos](../README.md#ordem-de-execução) até o último fechar | ✅ |
| D-03 | A B-07 do [plano 27](../27-conversation-losses/F2-contract.md) (o teste do vocabulário canônico) | — | B-04, B-07 | 2026-10-10 · **absorvida** pela B-04 daqui, mais larga e antes, com o mesmo arquivo de vocabulário (`scripts/engine-vocabulary.json`). A B-07 do 27 mantém o ID e passa a acrescentar entradas e casos ao portão, em vez de criar um teste paralelo. Registrado no 27 como a [D-14](../27-conversation-losses/decisions.md), no ajuste dos planos pedido pelo usuário | ✅ |
| D-05 | O termo no código e nas pastas | — | B-03, B-06 | 2026-10-10 · **`engines/`** e `engine` no código; "agente" na UI, com o nome do motor como `{agent}`. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |
| D-13 | Comentário conta no portão | — | B-04 | 2026-10-10 · **sim, pelo baseline**: comentário do núcleo entra na leitura do portão, com as ocorrências de hoje no baseline e a B-41 como prazo. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |
| D-15 | O `engines/` do app nasce vazio | — | B-06 | 2026-10-10 · **vazio, com o lint**: `mobile/lib/engines/` e `app/engines.dart` nascem na B-06. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |

## F1 — Porta de motor e conversa

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-08 | A versão do contrato ([03 · ME-13](../../discovery/03-multiplos-motores-de-agente.md#18-decisões-em-aberto)) | — | B-12, B-47 | 2026-10-10 · **`v+1` com janela de `v-1`**: sobe na B-12, os dois formatos até a B-47, que fecha a janela. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |
| D-09 | O REST no pacote `contracts` | — | B-12 | 2026-10-10 · **todas as rotas REST** no pacote `contracts`, **contra a recomendação** (só as da conversa). As da conversa entram na B-12; o resto entra na B-48 (F6), depois que as rotas do `claude-config` mudarem de lugar, para não gerar tipo de rota que muda em seguida. Planos que criarem rota nova depois deste já nascem no pacote. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |

## F2 — Ferramentas canônicas

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-02 | Quem monta o rótulo da ferramenta | — | B-14, B-18, B-19 | 2026-10-10 · **o backend** monta o `label` (`messageKey` + `params`); o cliente só traduz. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |
| D-04 | O input cru no contrato | — | B-15, B-18, B-19 | 2026-10-10 · **opaco** (`rawInput`), só para a entrada exata e a exportação; o portão proíbe ler campo dele. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |

## F3 — Interações e estado

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: as formas são as da [discovery §6.3](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#63-interações-e-estado-da-sessão), e a pergunta já é a do plano 24 | — | — | — | — |

## F4 — Modos, esforço, uso e blocos

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-16 | Os nomes dos modos canônicos | — | B-26, B-27 | 2026-10-10 · **`ask` · `acceptEdits` · `readOnly` · `allowAll`**, com a migração do banco e do estado salvo nos clientes. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |
| D-17 | O `usage` canônico leva as contagens de raciocínio e de buscas web que o [plano 16](../16-usage-and-cost/README.md) mostra | — | B-29 | 2026-10-10 · **sim, como campos opcionais** (`reasoningTokens?`, `webSearches?`) do `usage` canônico; o corte condicional do plano 16 não vale. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |

## F5 — Permissão pelo dialeto

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-11 | A gramática de regra ([03 · ME-11](../../discovery/03-multiplos-motores-de-agente.md#18-decisões-em-aberto)) | — | B-31 | 2026-10-10 · **a gramática canônica já**, **contra a recomendação** (a do Claude atrás do dialeto): a regra é escrita por `kind` — `shell(git status:*)`, `file.edit(src/**)`, `mcp(srv:tool)`, `web.fetch(domain:…)` — e o domínio a entende sem saber de motor. O `RuleDialect` continua, com outro papel: traduz a regra canônica para o formato do motor (no Claude, o `updatedPermissions`) e a sugestão nativa do motor para a canônica. Muda a F5 (B-31, B-33) e entra no ADR-025; o que acontece com as regras gravadas é a D-18. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |
| D-12 | A B-08 do [plano 15](../15-rules-management/F1-rules-backend.md), em andamento | — | — | 2026-10-10 · **pausada até a F5 daqui**, consequência da D-01 (o 15 vem depois deste plano). Ela aprofunda a gramática do Claude no domínio, que é exatamente o que a F5 move; retoma escrita atrás do `RuleDialect`. Registrado no plano 15 na mesma data | ✅ |
| D-18 | As regras gravadas na gramática do Claude, com a gramática canônica da D-11 | — | B-33 | 2026-10-10 · **migrar todas, sem ficar nada**: uma migration nova converte cada regra para a forma canônica (`Bash(git status:*)` → `shell(git status:*)`, `Edit(src/**)` → `file.edit(src/**)`, `mcp__srv__tool` → `mcp(srv:tool)`); a que não tiver tradução inequívoca é **desligada**, nunca apagada, e listada na tela de regras com o padrão antigo, para a pessoa recriar. Nenhuma regra fica na gramática do Claude. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |

## F6 — Extensões isoladas

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | A divisão do `claude-config` | — | B-36 | 2026-10-10 · **padrões e MCP no núcleo, por motor; conta, instalação, teste de modelo, plugins, skills, output styles e `.claude/` na extensão**. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |
| D-07 | As rotas do plano 13 e a rota da tela | — | B-36, B-38 | 2026-10-10 · **`/engines/claude/*`** para a extensão, **`/engines/:engine/*`** para o núcleo por motor, `/claude/*` em `v-1`; no web, `/settings/agents/$engine`. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |
| D-10 | Os kinds de auditoria `claude.*` | — | B-36 | 2026-10-10 · **renomear todos**, **contra a recomendação** (só os do núcleo): nenhum kind de auditoria tem nome de motor. Os do núcleo seguem o módulo (`agentSettings.defaultsChanged`, `mcp.*`), e os da extensão viram `engine.*` com o motor no payload (`engine.pluginAdded`, `engine.pluginUpdated`, `engine.pluginToggled`, `engine.pluginRemoved`, `engine.skillSourceToggled`, `engine.diagnosticsProbed`), por migration nova que renomeia o `claude.defaultsChanged` gravado. As **tabelas** da extensão (`claude_plugins`, `claude_skill_preferences`) mantêm o prefixo: são da extensão, e o portão não lê o esquema da extensão. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |

## F7 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-14 | O motor de teste | — | B-43…B-45 | 2026-10-10 · **sim, no e2e das duas pontas e na suíte de contrato da porta**. Com a recomendação. Decisão do usuário, pelas perguntas da revisão dos gaps | ✅ |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
