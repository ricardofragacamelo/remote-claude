# Plano 23 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Normas e contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Como o "permitir tudo" funciona por baixo | — | B-01, B-04, B-05 | 2026-10-07, **decisão do usuário**: um modo nosso. O SDK roda em `default`, o `canUseTool` continua sendo chamado e o backend aprova sozinho. Vira a [ADR-022](../../architecture/shared/00-decisions.md#adr-022--permitir-tudo-é-um-modo-nosso-não-o-bypasspermissions-do-sdk) | ✅ |
| D-02 | Onde o usuário liga e desliga | — | B-12, B-15 | 2026-10-07, **decisão do usuário**: no chip de modo da sessão, no web e no mobile. Não entra como padrão nas configurações | ✅ |
| D-03 | Corrigir as regras que nunca casam neste plano | — | F2 | 2026-10-07, **decisão do usuário**: sim, no mesmo plano | ✅ |
| D-04 | O nome do modo no contrato | se reaproveitar `bypassPermissions` muda a semântica de um valor que existe | B-02 | 2026-10-07: **`allowAll`**, valor novo. `bypassPermissions` continua significando o modo do SDK, que nunca é honrado nem oferecido. Reaproveitar o nome mudaria a semântica de um valor que existe (e pediria `v` novo), e confundiria o `pnpm scan:security`, que procura `bypassPermissions` como padrão | ✅ |

### D-01 — Modo nosso, não o do SDK

| | Modo nosso (`allowAll`) | `bypassPermissions` do SDK |
|---|---|---|
| `deny` nosso | recusa | ignorado: o CLI não chama o `canUseTool` |
| histórico de cada aprovação | `permission_requests` com `auto = true` | nenhum |
| desligar no meio da sessão | vale na próxima tool, porque o modo é lido a cada pedido | depende do CLI aceitar a volta; não medido |
| `allowDangerouslySkipPermissions` | continua `false`, escrito uma vez | teria de virar configurável |

## F1 — Permitir tudo

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | Quais tools continuam perguntando em Permitir tudo | — | B-05 | 2026-10-07: **`AskUserQuestion` e `ExitPlanMode`**. São o Claude pedindo uma resposta, não uma permissão. Aprovar sozinho entregaria ao modelo uma pergunta sem resposta. A lista é uma constante do domínio, `HUMAN_ONLY_TOOLS` | ✅ |
| D-06 | O que acontece com os cards abertos ao ligar | — | B-06 | 2026-10-07: **são resolvidos** como se tivessem chegado depois, menos os de `HUMAN_ONLY_TOOLS` e os que um `deny` recusaria. Quem liga Permitir tudo com um card na tela quer que ele suma. Deixar o card exigiria mais um toque, o que contradiz o pedido | ✅ |
| D-12 | A falha ao ler as regras persistidas em Permitir tudo | — | B-05 | 2026-10-07: **pergunta ao humano**, como hoje ([PermissionRuleBook](../../../backend/src/application/permission/permission-rule-book.ts)). Um `deny` não lido não pode ser trocado por uma aprovação automática | ✅ |

## F2 — Alcance das regras

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | Linha de shell composta coberta por `allow` | — | B-08 | 2026-10-07: **coberta quando cada comando dela é coberto** por um `allow` (de qualquer escopo que alcance o pedido). **Emenda a [15 · D-07](../15-rules-management/decisions.md)**, que só aceitava linha de um comando. Ver abaixo | ✅ |
| D-08 | Como o prefixo de um comando é escolhido, e o que nunca vira prefixo | — | B-09 | 2026-10-07: até **dois tokens**: o primeiro, mais o segundo quando ele é uma palavra de subcomando (`^[a-z][a-z0-9_:-]*$`). Comando cujo primeiro token é interpretador, lançador ou elevação nunca vira prefixo. A lista `UNBOUNDED_COMMANDS` é a da [15 · D-09](../15-rules-management/decisions.md#d-09--o-que-é-largo-demais), e mora no domínio para a 15 ler | ✅ |
| D-09 | O alcance que o card deixa pré-selecionado | — | B-13, B-16 | 2026-10-07: **prefixo** quando existe (shell), **exato** para tool de caminho e URL, **tool** quando é o único. É o pedido do usuário (menos perguntas), e a segunda etapa de `project`/`always` continua mostrando os padrões por extenso | ✅ |
| D-11 | Qual regra fica registrada quando várias cobrem uma linha | — | B-08 | 2026-10-07: **a do primeiro comando** da linha. `permission_requests.rule_id` é uma coluna; mudar para lista é migração e mudança de contrato da trilha por um ganho pequeno. O `permission.resolved` diz `via: 'rule'` | ✅ |
| D-13 | Resposta com prefixo de vários padrões em `project`/`always` quando a gravação de um falha | — | B-10 | 2026-10-07: os padrões são **validados todos antes** de gravar qualquer um. Se uma gravação falhar no meio, as regras criadas **nesta resposta** são revogadas e o pedido continua aberto. É a mesma regra da trilha na `GrantPermissionRuleUseCase` | ✅ |

### D-07 — A linha composta

O `allow` de prefixo hoje só cobre linha de um comando, porque sem parser o único erro seguro é
perguntar de novo. O custo disso, medido no banco: quase todo comando que o Claude escreve tem
`2>&1`, `|` ou `&&`, então nenhuma regra de prefixo jamais casaria.

A leitura nova, toda no domínio, em `shell-syntax.ts`:

1. **neutraliza** os redirecionamentos que não mudam o que roda: `N>&M`, `>/dev/null`,
   `2>/dev/null`, `&>/dev/null` (com ou sem espaço);
2. o que sobrar de **opaco** (`$(`, crase, `<(`, `>(`, `>`, `>>`, `<`, heredoc, quebra escapada)
   faz a linha perguntar, como hoje;
3. corta nos separadores (`&&`, `||`, `;`, `|`, `&`, quebra de linha);
4. se houver mais de um pedaço, **cada pedaço** precisa ter aspas balanceadas e nenhuma barra
   invertida. Senão a linha pergunta. É o que garante que o pedaço é o comando que o shell roda, e
   não metade de um texto entre aspas;
5. cada pedaço precisa ser coberto por um `allow` (prefixo com fronteira de token, ou exato
   idêntico ao pedaço).

O `deny` não muda: continua cobrindo a linha se cobrir qualquer pedaço, com o corte agressivo de
hoje. O `allow` exato continua cobrindo a linha idêntica.

## F3 — Web

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-10 | O atalho que gira os modos passa por Permitir tudo? | — | B-12, B-15 | 2026-10-07: **não**. Permitir tudo só se escolhe no menu, com o aviso à vista. Um atalho girando modos não pode desligar todas as perguntas por acidente | ✅ |

## F4 — Mobile

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: o app segue as D-09 e D-10 do web | — | — | — | — |

## F5 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-14 | Qual alcance o e2e prova pela porta do usuário | as gravações que o SDK falso tem | B-18, B-19 | 2026-10-07: **a tool inteira, no `Write` do `tool-turn`**. Nas gravações, o shell que pergunta é `node -e "…"` (intérprete, e com `)`: nenhum alcance além do caso a caso) e o `ls` o CLI aprova sozinho. Gravar uma execução nova só para isso não paga: o prefixo e a linha composta já estão provados contra o Postgres real (S-57, S-64). O e2e prova o caminho — o card oferece, a pessoa escolhe, a regra responde a próxima | ✅ |

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
