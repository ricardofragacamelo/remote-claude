# F4 — Modos, esforço, uso e blocos

Plano: [28 — Núcleo neutro de agente](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-interactions.md): a interação `plan`, que oferece os modos depois da aprovação.
**Entrega:**

- modos de permissão nossos, que o adapter traduz;
- níveis de esforço anunciados pelo motor;
- `usage` com nomes nossos e custo opcional;
- blocos de mensagem com nomes nossos.

---

## Por quê

Os valores do Claude estão escritos à mão em 9 lugares do web e em 2 do app. Estão em três schemas, numa
`CHECK` do banco e no domínio de permissão ([discovery §4](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#4-inventário-de-2026-10-10)).
O `usage` é o mapa da Anthropic, lido pelo redutor do web com as chaves dela. `default` e `plan` só
dizem algo para quem conhece o Claude ([D-16](decisions.md#f4--modos-esforço-uso-e-blocos)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-26 — Os modos canônicos no backend e no banco 🔲

`PermissionMode` passa a ser `ask · acceptEdits · readOnly · allowAll`, os da
[discovery 03 §6.5](../../discovery/03-multiplos-motores-de-agente.md#65-modos-de-permissão-canônicos) mais
o `allowAll` do [ADR-022](../../architecture/shared/00-decisions.md#adr-022--permitir-tudo-é-um-modo-nosso-não-o-bypasspermissions-do-sdk).
O `bypassPermissions` sai do enum, porque já era recusado.

O adapter traduz para o CLI: o `sdkPermissionMode()` e o `mode-widening.ts` vão para
`adapter/outbound/engines/claude/`. O `readOnly` é garantido pelo **nosso** gate, que nega todo `file.*`
de escrita e todo `shell`, e o modo do motor fica como segunda camada.

No contrato, os três schemas (`session.start`, `session.setPermissionMode`, `session.started`) ficam com
os valores antigos só em `v-1`. No banco, uma migration nova troca a `CHECK` e os dados de
`claude_defaults.permission_mode`, e o ADR-022 é atualizado. Cenários S-77…S-80.

### B-27 — Os modos nos clientes, pelo que o motor anuncia 🔲

Os modos oferecidos são os de `capabilities.permissionModes`. Saem as listas escritas à mão:

- no web: `claude-panel.store.ts`, `panel-modes.ts`, `claude-panel-restorer.ts`,
  `claude-settings/types/defaults.ts` e `PlanApprovalCard.tsx`;
- no app: `session_choices.dart` e `plan_approval_card.dart`.

As chaves `sessions.mode.*` e `mode*` passam a ser pelos nomes canônicos, com `{agent}` no lugar de
"Claude". O estado guardado nos clientes com o valor antigo (o restaurador do painel, a escolha do app)
é traduzido na leitura, uma vez. Cenários S-81, S-82.

### B-28 — Os níveis de esforço anunciados 🔲

`capabilities.effortLevels` diz o subconjunto do enum canônico que o motor tem. Saem as listas do web
(`claude-panel.store.ts`, `claude-panel-restorer.ts`, `insight.service.ts`, `defaults.ts`) e a do app
(`session_choices.dart`). Sem a capacidade, o seletor não existe. O `refuseUnsupportedEffort` do domínio
continua, pelo que o motor anuncia. Cenários S-83, S-84.

### B-29 — O `usage` canônico 🔲

`turn.completed.usage` passa a ser `{ inputTokens?, outputTokens?, cacheReadTokens?, cacheWriteTokens? }`,
e o `costUsd` fica **opcional**. As duas coisas seguem a [discovery 03 §6.8](../../discovery/03-multiplos-motores-de-agente.md#68-uso-e-custo)
e a capacidade `cost`. O mapa da Anthropic fica no adapter.

Saem as chaves `input_tokens`/`cache_*` do `conversation-reducer.ts`. O `TurnRow.tsx`, o turno do app e o
`useBrowserNotifications.ts` mostram o que vier. O [plano 16](../16-usage-and-cost/README.md) consome
esta forma, e as contagens de raciocínio e de buscas web que ele mostra entram como campos opcionais se
a [D-17](decisions.md#f4--modos-esforço-uso-e-blocos) confirmar. Cenários S-85…S-87.

### B-30 — Os blocos com nome nosso 🔲

Os blocos de `message.completed` passam a ter nomes nossos: `redactedThinking`, `toolUse` e `toolResult`.
O `thinking` fica, e só é emitido com a capacidade `thinking`. Mudam o mapper do adapter, o histórico, o
`blocksOf` do web e o `_finished` do app. O baseline perde as entradas desta fase. Cenários S-88…S-90.

---

## Cenários cobertos

S-77…S-90.

---

## Critério de conclusão

```bash
pnpm verify
```
