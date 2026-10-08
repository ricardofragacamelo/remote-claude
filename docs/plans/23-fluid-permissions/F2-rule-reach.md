# F2 — Alcance das regras

Plano: [23 — Permissões fluidas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-allow-all.md).
**Entrega:** uma linha de shell composta é coberta quando cada comando dela é; o card recebe os
alcances de cada pedido; a resposta escolhe um alcance em `session`, `project` e `always`; e o
`permission.resolved` diz se foi uma regra ou o modo que respondeu.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-08 — A linha composta ✅

Em `shell-syntax.ts`, `commandsOf(line): string[] | null`: os comandos de uma linha pela leitura
da [D-07](decisions.md#d-07--a-linha-composta), ou `null` quando ela não pode ser lida com
segurança. Em `rule-precedence.ts`, `answeringRule` ganha um passo depois do `allow` de uma regra
só: para tool de shell, quando `commandsOf` devolve mais de um comando, ou um comando diferente da
linha (porque um redirecionamento foi neutralizado), cada comando precisa ser coberto por algum
`allow` lido como linha de um comando só. A regra devolvida é a do primeiro comando
([D-11](decisions.md#f2--alcance-das-regras)). O `deny` não muda.

### B-09 — Os alcances ✅

`rule-reach.ts`, no domínio, puro:

- `reachesFor(toolName, input): RuleReach[]`, com `RuleReach = { reach, patterns }`;
- `exact`: o `patternForInvocation` de hoje, quando existe;
- `prefix` (só shell): um `commandPrefix` por comando de `commandsOf`, sem repetição, e só quando
  todo comando tem um. `commandPrefix` segue a [D-08](decisions.md#f2--alcance-das-regras), e
  devolve `null` para interpretador, lançador ou elevação (`UNBOUNDED_COMMANDS`), para atribuição de
  ambiente e para um token com `)`;
- `tool` (nunca shell): `[toolName]`.

Todo padrão devolvido passa por `parseRulePattern` e volta igual (S-54).

### B-10 — A resposta com alcance ✅

- `requestedPayload` manda `reaches`; `project`/`always` entram quando há algum alcance (e
  `project` continua exigindo workspace). O `pattern` de hoje continua, e é o do `exact`, para não
  quebrar o cliente que ainda o lê;
- `ResolvePermissionCommand` ganha `reach` (ausente → `exact`). A `ResolvePermissionUseCase`
  recalcula `reachesFor` a partir do pedido, e recusa com `PermissionScopeUnsupportedError` o
  alcance que não estiver lá. O cliente nunca manda padrão;
- `project`/`always`: valida todos os padrões, depois grava um por um. Se uma gravação falhar, as
  regras criadas nesta resposta são revogadas ([D-13](decisions.md#f2--alcance-das-regras));
- `session`: o `PermissionSettlement.rememberRule` cria uma regra de sessão por padrão do alcance
  escolhido. A escolha viaja na `PermissionAnswer`.

### B-11 — Quem respondeu ✅

`via` na `PermissionResolution` e no `resolvedPayload`: `rule` quando um `ruleId` respondeu,
`allowAll` quando foi o modo, ausente para humano e prazo. Persistido de onde já está: `rule_id`
preenchido é `rule`, e `auto = true` com `decision = allow` e sem `rule_id` é `allowAll`. Não
precisa de migration.

---

## Cenários cobertos

S-31…S-68.

---

## Critério de conclusão

```bash
pnpm verify
```
