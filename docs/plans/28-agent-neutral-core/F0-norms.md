# F0 — Normas e catraca

Plano: [28 — Núcleo neutro de agente](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada dentro do plano. Fora dele, da F1 do [plano 26](../26-mobile-conversation-parity/README.md)
fechada (o `render-parity.json` que a [F2](F2-canonical-tools.md) reescreve).
**Entrega:**

- as normas escritas: o ADR-025, as notas nos ADRs que ele altera, o AGENTS, o `shared/12-engines.md` e
  a forma-alvo nos documentos de arquitetura;
- o portão de neutralidade (`pnpm neutral:check`) no portão 11, com o vocabulário num arquivo só e o
  baseline das violações de hoje;
- as regras de lint dos três anéis nas três pontas, valendo já;
- os planos seguintes conferidos contra as normas.

---

## Por quê

A catraca vem antes do código pelo mesmo motivo que a [F1 do 26](../26-mobile-conversation-parity/F1-parity-map.md)
vem antes do código do app: a lista do que falta nasce junto com a regra, e cada fase seguinte tira
linhas dela. Sem a catraca, as fases F1…F6 neutralizariam uma parte enquanto outra parte do repositório
(este plano incluído) acoplava de novo.

As normas vêm antes porque cada fase seguinte **aponta** para elas, sem duplicar
([plans/README · Regras](../README.md#regras), regra 6). Documento que nasce depois do código descreve o
que foi feito, e não o que deveria ser.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — ADR-025 e as notas nos ADRs que ele altera 🔲

Em [00-decisions](../../architecture/shared/00-decisions.md), o **ADR-025 — "Núcleo neutro de agente,
extensões isoladas por motor nas três pontas"**:

- os três anéis (núcleo, `engines/<motor>/`, composição);
- o `kind` com o `origin` opaco;
- a interpretação no adapter;
- o portão de neutralidade e o motor de teste;
- a gramática canônica de regra de permissão, com o `RuleDialect` como tradutor por motor
  ([D-11](decisions.md#f5--permissão-pelo-dialeto), [D-18](decisions.md#f5--permissão-pelo-dialeto));
- o contrato REST inteiro no pacote `contracts` ([D-09](decisions.md#f1--porta-de-motor-e-conversa));
- nenhum kind de auditoria com nome de motor ([D-10](decisions.md#f6--extensões-isoladas)).

O conteúdo é o da [discovery §3, §5 e §7](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#3-princípios).
Ele **altera** o ADR-001 (o Agent SDK passa a ser a implementação do Claude da porta de motor) e
**estende** o ADR-006 (o contrato próprio passa a cobrir ferramentas, modos, ids de conversa e unidade
de custo, com as convenções do 27).

Notas de alteração, uma linha cada, no ADR-001, 006, 011, 013, 018 e 022, apontando para o ADR-025 e para
a fase que muda cada um ([discovery §8.2](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#82-adrs-00-decisions)).
A reescrita do ADR-011 é da [F5](F5-permission-dialect.md#b-35--o-adr-011-reescrito-como-contrato-de-segurança-por-motor-), e a
reclassificação do ADR-018 é da [F6](F6-engine-extensions.md). Aqui entra só a nota. Cenários S-01, S-02.

### B-02 — O AGENTS 🔲

Em [AGENTS.md](../../../AGENTS.md), o que a [discovery §8.1](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#81-agentsmd)
lista:

- **O que é este projeto:** "operar o agente de código da máquina (hoje o Claude Code, pela porta de motor)".
- **Regra 12 — Núcleo neutro de agente:** nenhum nome de motor, de ferramenta, de modo ou campo de input
  cru fora de `engines/<motor>/`, nas três pontas; o cliente desenha pelo `kind`; o contrato é nosso.
  Verificado por `pnpm neutral:check` e pelo lint de arquitetura.
- **Regra 6:** acrescenta "e o núcleo nunca importa `engines/`".
- **O roteador:** "como o backend conversa com um agente de código", e a linha "mexer em algo que só um
  agente tem", que aponta para o `shared/12-engines.md`.
- **Os gatilhos:** o evento é canônico (`kind`, `origin`, `messageKey`); o que vem de uma ferramenta é
  mostrado pelo `kind`.
- **Os anti-padrões novos:**
  - nome de ferramenta, modo ou campo de input fora de `engines/`;
  - cliente decidindo por `engine`, `origin.native` ou `toolName`;
  - `Claude*`/`claudeSessionId` no núcleo;
  - nome de motor numa string de i18n do núcleo;
  - o "`query()` sem `settingSources`" generalizado para "sessão de motor aberta sem a asserção de
    segurança do motor".

O `CLAUDE.md` não muda. Cenário S-03.

### B-03 — O `shared/12-engines.md` e a forma-alvo nos documentos 🔲

O documento novo [shared/12-engines.md](../../architecture/shared/README.md) traz:

- o que é núcleo e o que é extensão, e como criar uma extensão (os registros do núcleo onde ela se pendura);
- o `kind` e as convenções do [27](../27-conversation-losses/README.md) generalizadas;
- as capacidades e quem as anuncia;
- o portão e o baseline;
- o motor de teste.

Ele entra no índice do `shared/` e no roteador do AGENTS.

Nos documentos que descrevem estrutura, a **forma-alvo**, marcada "alvo do plano 28 — chega na F*n*":
[architecture/README](../../architecture/README.md), [backend/01](../../architecture/backend/01-clean-architecture.md),
[backend/02](../../architecture/backend/02-folder-structure.md), [web/01](../../architecture/web/01-architecture.md),
[web/02](../../architecture/web/02-folder-structure.md), [mobile/01](../../architecture/mobile/01-architecture.md),
[mobile/02](../../architecture/mobile/02-folder-structure.md) e [shared/07](../../architecture/shared/07-repository-layout.md).
E, já valendo, as regras e o portão em [shared/09](../../architecture/shared/09-code-quality.md),
[shared/10](../../architecture/shared/10-definition-of-done.md) e [shared/11](../../architecture/shared/11-validation-protocol.md)
(o portão 11 vira "Contrato, i18n e neutralidade"), e o `pnpm neutral:check` na seção **Comandos** do
[README da raiz](../../../README.md#comandos).

O detalhe de contrato (o [05](../../architecture/shared/05-websocket-protocol.md)) **não** entra aqui:
cada fase escreve o seu evento junto com ele. Cenário S-04.

### B-04 — O portão de neutralidade: `pnpm neutral:check` 🔲

Um script, pela regra 10 do AGENTS. A lógica fica em `scripts/lib/engine-neutrality.mjs`, a entrada em
`scripts/engine-neutrality.mjs` e os testes em `test/unit/scripts/engine-neutrality.spec.mjs`. Ele
roda no `check:contracts-i18n` do portão 11, ao lado do `render:check` do 26.

- **O vocabulário fica num arquivo só**, `scripts/engine-vocabulary.json`, com o motivo de cada entrada.
  É o arquivo que a [27 · B-07](../27-conversation-losses/F2-contract.md) previa
  ([D-03](decisions.md#f0--normas)). Entram:
  - os nomes de motor: `claude`, `anthropic`, `sdk`;
  - os nomes nativos de ferramenta do Claude;
  - os modos do CLI;
  - as chaves cruas de input: `old_string`, `new_string`, `file_path`, `todos`, `activeForm`, `notebook_path`…;
  - as chaves de uso da Anthropic;
  - os subtipos `snake_case` do SDK.
- **O que ele lê:**
  - o código do núcleo nas três pontas: identificadores, literais e comentários ([D-13](decisions.md#f0--normas));
  - todos os schemas de [packages/contracts/schema/](../../../packages/contracts/schema/): chaves, enums,
    `kind`, `const` e descrições;
  - as chaves **e** os valores de i18n dos namespaces do núcleo, no web, no app e no backend.
- **Fora da leitura:**
  - `engines/` nas três pontas;
  - o valor de `origin.native`;
  - o código gerado (`protocol.ts`, `protocol.g.dart`, `*.g.dart`);
  - os testes e as fixtures gravadas;
  - os nomes de produto da [discovery §5.4](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#54-o-que-fica-com-o-nome-do-produto),
    numa lista de exceções permanentes, cada um com o motivo.
- **A saída** diz o arquivo, a linha, o termo e o motivo do vocabulário, e a dica de onde a coisa
  deveria morar.

Cenários S-05…S-10.

### B-05 — O baseline: a catraca que só encolhe 🔲

`scripts/engine-neutrality-baseline.json`: cada violação de hoje, com arquivo, termo e a **fase deste
plano que a remove** (`F1`…`F6`). O portão reprova:

- violação fora do baseline;
- entrada do baseline que **não ocorre mais**, para que o baseline acompanhe o código;
- entrada cuja fase já está ✅ no `progress.md` deste plano, a mesma regra do `render-parity.json` da
  [26 · B-05](../26-mobile-conversation-parity/F1-parity-map.md).

O baseline nasce de uma execução do próprio script (`--write-baseline`), e cada entrada recebe a fase à
mão, pela tabela da [discovery §4](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#4-inventário-de-2026-10-10).
Ao fim da [F7](F7-e2e.md) ele está **vazio**, e a opção de gravar o baseline sai do script. Cenários
S-11…S-16.

### B-06 — O lint dos três anéis, nas três pontas 🔲

As regras da [discovery §7.1](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#71-lint-de-arquitetura-nas-três-pontas),
**valendo já**, com `engines/` vazio onde ainda não existe:

- **backend** (`dependency-cruiser.config.mjs`): `engine-extension-is-isolated`,
  `engines-do-not-know-each-other`, `adapters-do-not-know-each-other` (os 2 imports de hoje, de `diag` e
  de `permission` para `claude/`, entram como violação conhecida, com a [F5](F5-permission-dialect.md)
  como prazo, pelo mesmo baseline da B-05), e o `sdk-is-isolated` aceitando os dois caminhos até a F1
  mover o adapter;
- **web** (`eslint.config.mjs`): `core-cannot-import-engines` e `engines-are-isolated`;
- **app** (`analysis_options.yaml`, lido pelo `scripts/mobile.mjs arch`): `core_cannot_import_engines`,
  `features_cannot_import_engines` e `engines_are_isolated`, com `mobile/lib/engines/` e
  `mobile/lib/app/engines.dart` criados vazios ([D-15](decisions.md#f0--normas)).

Cada regra tem um teste de que reprova (o portão que não reprova é pior que nenhum,
[09-code-quality](../../architecture/shared/09-code-quality.md#mobile--import_lint)). Cenários S-17…S-22.

### B-07 — Os planos seguintes conferidos contra as normas 🔲

Os planos 12, 13, 14, 15, 16, 18, 19, 26 e 27 foram **ajustados na criação deste plano** (2026-10-10, pedido
do usuário): dependências, ordem e as tasks 🔲 reescritas no isolamento, nas regras pelo dialeto e no
contrato canônico. Cada ajuste tem uma decisão ✅ no `decisions.md` daquele plano. Esta task confere os
ajustes contra as normas **como ficaram escritas** na B-01…B-03:

- os nomes de documento (`04-engine-integration`, `12-engines`);
- os caminhos (`engines/claude/`);
- as rotas (`/engines/…`);
- o vocabulário do portão.

A absorção da B-07 do 27 já está registrada lá, na [D-14](../27-conversation-losses/decisions.md)
([D-03](decisions.md#f0--normas)); aqui ela é só conferida.

A ordem e as dependências ficam no [índice dos planos](../README.md#ordem-de-execução) até o último
plano da lista fechar. Cenários S-23, S-24.

---

## Cenários cobertos

S-01…S-24.

---

## Critério de conclusão

```bash
pnpm verify          # o portão 11 já roda o neutral:check, verde com o baseline de hoje
pnpm docs:check      # as normas novas estão no grafo, sem link quebrado
```
