# F0 — Normas e contrato

Plano: [23 — Permissões fluidas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada. É a primeira fase.
**Entrega:** a reversão do "nunca permitir tudo" registrada numa ADR, as normas dizendo o novo, o
contrato com `allowAll`, `reaches`, `reach` e `via` nas três pontas, e as chaves de tradução.

**Por quê primeiro:** é uma mudança de contrato e de uma decisão de segurança repetida em quatro
planos. Escrita depois do código, viraria a descrição do que o código faz, e não a regra que ele segue.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — ADR-022 e as normas emendadas ✅

- [00-decisions](../../architecture/shared/00-decisions.md): **ADR-022** — Permitir tudo é um modo
  nosso, e não o `bypassPermissions` do SDK. Contexto (o relato e o banco), alternativas (a tabela
  da [D-01](decisions.md#d-01--modo-nosso-não-o-do-sdk)), decisão, e o que **não** muda:
  `allowDangerouslySkipPermissions` segue `false`, `bypassPermissions` segue nunca oferecido nem
  aceito como padrão, e o `scan:security` segue procurando os dois.
- [backend/04](../../architecture/backend/04-claude-integration.md): o modo `allowAll` (o SDK em
  `default`, a ordem idempotência → regras → modo, `HUMAN_ONLY_TOOLS`, os pendentes ao ligar); a
  linha composta da [D-07](decisions.md#d-07--a-linha-composta) no lugar do item 3 da gramática;
  os alcances (`exact`, `prefix`, `tool`) e a [D-08](decisions.md#f2--alcance-das-regras).
- [web/03-ui-system](../../architecture/web/03-ui-system.md) e
  [mobile/04-ui](../../architecture/mobile/04-ui.md): Permitir tudo no chip, em tom destrutivo com
  ícone e texto, fora do atalho que gira os modos; o seletor de alcance no card; a marca na linha
  da tool. O "`bypassPermissions` nunca" continua escrito como está.
- [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md): a linha do
  `session.setPermissionMode` passa a citar `allowAll`.

### B-02 — O contrato ✅

Em `packages/contracts/schema/`, todos com `description`:

- `allowAll` no enum de `session.start.permissionMode`, `session.setPermissionMode.mode` e
  `session.started.permissionMode`;
- `permission.requested.reaches`: lista de `{ reach: 'exact' | 'prefix' | 'tool', patterns: string[] }`,
  calculada pelo servidor; a descrição de `suggestions` passa a dizer que `project`/`always` vêm
  quando há algum alcance;
- `permission.resolve.reach`: opcional, `exact` | `prefix` | `tool`; ausente vale `exact`. A
  descrição de `scope` deixa de dizer "o padrão mais estreito" e passa a dizer "os padrões do alcance";
- `permission.resolved.via`: opcional, `rule` | `allowAll`, presente quando ninguém foi perguntado.

Gerar com `pnpm contracts`, e escrever o [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md):
a tabela de comandos, o payload de `permission.requested` (com `reaches`), a resposta (com
`reach`), o `permission.resolved` (com `via`), e a regra "o cliente manda o alcance, nunca o
padrão". Adicionar campo opcional e valor de enum novo não muda `v`
([versionamento](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)).

### B-03 — Chaves de tradução ✅

`en` e `pt-BR` no web e nos ARB do app, com o par no
[mapa compartilhado](../../../scripts/i18n-shared.json): o rótulo, a descrição e o aviso de
Permitir tudo; os três alcances, com a frase que diz o alcance por extenso; a marca "aprovado
automaticamente — Permitir tudo" e "— por uma regra". Ver [shared/02-i18n](../../architecture/shared/02-i18n.md).

---

## Cenários cobertos

S-01, S-02, S-03, S-04.

---

## Critério de conclusão

```bash
pnpm verify
```
