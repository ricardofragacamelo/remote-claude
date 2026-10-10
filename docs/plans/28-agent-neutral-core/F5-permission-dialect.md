# F5 — Permissão pelo dialeto

Plano: [28 — Núcleo neutro de agente](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-modes-and-usage.md): os modos canônicos, que as regras e a precedência leem.
**Entrega:**

- a regra de permissão tem uma **gramática canônica**, por `kind`, que o domínio entende sem saber de
  motor ([D-11](decisions.md#f5--permissão-pelo-dialeto));
- o `RuleDialect` de cada motor só **traduz**: da regra canônica para o formato do motor, e da sugestão
  nativa do motor para a canônica;
- todas as regras gravadas foram migradas, e nenhuma fica na gramática do Claude
  ([D-18](decisions.md#f5--permissão-pelo-dialeto));
- regras e pedidos guardam o motor e o `kind`;
- os adapters não se importam;
- o ADR-011 vira o contrato de segurança de todo motor.

---

## Por quê

O `domain/permission` é, hoje, o motor de permissão do Claude Code reescrito: a gramática `Tool(x:*)`, os
`SHELL_TOOLS`, os `MATCHED_FIELDS` e o `permissionMode === 'plan'`. As regras gravadas falam essa gramática
e voltam ao SDK como `updatedPermissions`.

O usuário decidiu pela **gramática canônica já**, e não só pela do Claude atrás de uma porta
([D-11](decisions.md#f5--permissão-pelo-dialeto)). Com ela, uma regra como `shell(npm test:*)` vale para
qualquer motor que tenha o `kind` `shell`, e o vocabulário do Claude sai do domínio **e** do banco. A
B-08 do [plano 15](../15-rules-management/README.md) espera esta fase e retoma escrita sobre a gramática
canônica ([D-12](decisions.md#f5--permissão-pelo-dialeto)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-31 — A gramática canônica de regra e o `RuleDialect` 🔲

**A gramática canônica** mora no domínio de `permission`: `<kind>` ou `<kind>(<matcher>)`. Os casos são:

- `shell(git status)` (exato) e `shell(git status:*)` (prefixo), com o casamento por segmento de comando
  composto que existe hoje. O `:*` de prefixo **só existe no `shell`**;
- `file.read(src/**)`, `file.edit(src/**)`, `file.write(…)`, `file.delete(…)` e `file.move(…)`, por
  **glob de caminho** relativo à pasta (`*` e `**`), nunca por `:*`;
- `search(src/**)`, pelo caminho em que se busca;
- `web.fetch(domain:example.com)`, pelo domínio da URL, e `web.search`, sem argumento, para a busca;
- `mcp(srv:tool)` e `mcp(srv:*)`;
- `agent`;
- e o `kind` sozinho (`shell`, `file.edit`, `web.fetch`), que é o alcance "a tool inteira" do 23.

Um `kind` que a gramática não tem, inclusive o `other`, não aceita regra: ele sempre pergunta.

O parser, o casamento, os alcances exato, prefixo e tool do [plano 23](../23-fluid-permissions/README.md),
a largura e a descrição (`messageKey` + `params`) são do domínio, sobre o `kind` e o `subject` da F2. O
`rule-pattern.ts`, o `shell-syntax.ts` e o `rule-reach.ts` deixam de citar nome de ferramenta e passam a
falar a gramática canônica. A tabela de `MATCHED_FIELDS` vira a do `subject`.

**O `RuleDialect`** é uma porta de `permission`, implementada por motor, só para traduzir:

- `toEngine(rule)`: o que vai ao motor. No Claude, o `updatedPermissions` na gramática dos settings;
- `fromNative(suggestion)`: as sugestões que o motor manda no `canUseTool`, convertidas para a forma
  canônica, ou descartadas com `warn` quando não têm tradução;
- `translate(nativePattern)`: usado só pela migration da B-33.

A implementação do Claude fica em `adapter/outbound/engines/claude/rule-dialect.ts`.

O contrato muda: `permission.requested.suggestions[].pattern` e `reaches[].patterns` passam a vir na
gramática canônica, e a descrição do 05 deixa de dizer "na gramática dos settings do Claude Code". A
gramática entra no ADR-025 e no [backend/03](../../architecture/backend/03-modules.md) (`permission`), e
a rota `/permission-rules` aceita e devolve a forma canônica. Cenários S-91…S-94, S-131, S-132.

### B-32 — A interação fora do alcance de regra e de modo, pelo `kind` 🔲

O `HUMAN_ONLY_TOOLS` (`AskUserQuestion`, `ExitPlanMode`) do `mode-approval.ts` vira "toda `interaction`":
`question` e `plan` nunca são respondidas por regra nem por `allowAll`. A `PermissionRuleToolInteractiveError`
continua, pelo `kind`. O `rule-precedence.ts` lê o `readOnly`, e não mais o `'plan'`. Cenários S-95, S-96.

### B-33 — As regras migradas, e `engine` e `tool_kind` no banco 🔲

Uma migration nova ([D-18](decisions.md#f5--permissão-pelo-dialeto)) faz quatro coisas:

- **converte toda regra gravada** para a gramática canônica, pelo `translate` do dialeto do Claude:
  `Bash(git status:*)` → `shell(git status:*)`, `Edit(src/**)` → `file.edit(src/**)`,
  `mcp__srv__tool` → `mcp(srv:tool)`;
- **desliga** a regra que não tiver tradução inequívoca, sem apagá-la: ela fica com o padrão antigo e
  um motivo, e a tela de regras a lista para a pessoa recriar;
- acrescenta `engine` em `permission_rules` (`null` para a regra canônica, que vale para todo motor com
  o `kind`; o nome do motor só onde a regra foi restrita a ele);
- acrescenta `tool_kind` ao lado do `tool_name` em `audit_entries` e `permission_requests`, e preenche as
  linhas antigas pelo classificador da [F2](F2-canonical-tools.md), numa passada idempotente.

A migration é idempotente e confere a contagem: as regras ativas antes são iguais às convertidas mais as
desligadas. O `tool_name` continua, como o nome nativo. A [auditoria](../14-audit-explained/README.md)
passa a poder filtrar pelo `kind`. Cenários S-97…S-99, S-133, S-134.

### B-34 — Os adapters não se importam 🔲

Os dois imports do inventário saem:

- o `diag/installation-versions.reader.ts` deixa de ler o `cli-version` do adapter do Claude e passa a
  perguntar ao `EngineRegistry` (o `describe()` da F1);
- o `permission/permission-resolved.listeners.ts` deixa de importar o `PermissionBridge` e passa a falar
  por uma porta que o adapter implementa.

A violação conhecida da [B-06](F0-norms.md#b-06--o-lint-dos-três-anéis-nas-três-pontas-) sai do
baseline, e a `adapters-do-not-know-each-other` passa a valer sem exceção. Cenários S-100, S-101.

### B-35 — O ADR-011 reescrito como contrato de segurança por motor 🔲

O [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)
passa a ser o contrato de segurança que **todo** adapter de motor cumpre, os seis itens da
[discovery 03 §6.6](../../discovery/03-multiplos-motores-de-agente.md#66-segurança-por-motor):

1. gate bloqueante;
2. auditoria antes da ferramenta;
3. sem autoaprovação do motor;
4. escopo de pasta;
5. credencial fora do backend;
6. a configuração do motor como arquivo sensível.

O `settingSources: ['project']`, o hook `PreToolUse` e a limpeza da pasta confiável ficam como a
**implementação do Claude**, no `04a-claude.md`. A asserção continua no ponto de abertura da sessão, e
cada adapter tem a sua.

Atualizam-se também:

- o `sensitive-files.ts`, que passa a ler a lista de arquivos de configuração de cada motor registrado;
- o anti-padrão do AGENTS, que já vem generalizado da F0;
- o [backend/03](../../architecture/backend/03-modules.md) (`permission`).

O baseline perde as entradas desta fase. Cenários S-102, S-103.

---

## Cenários cobertos

S-91…S-103, S-131…S-134.

---

## Critério de conclusão

```bash
pnpm verify
```
