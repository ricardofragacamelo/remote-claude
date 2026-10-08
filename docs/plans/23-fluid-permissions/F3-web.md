# F3 — Web

Plano: [23 — Permissões fluidas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-rule-reach.md).
**Entrega:** o painel do Claude liga e desliga Permitir tudo pelo chip de modo, o card deixa
escolher o alcance da regra, e a linha da tool diz quando ninguém foi perguntado e por quê.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-12 — Permitir tudo no chip ✅

`PanelMode` e `PANEL_MODES` ganham `allowAll`; o `claude-panel-restorer` o aceita. O
`SessionChoices` o oferece no menu com descrição e aviso, e o chip fica em tom destrutivo com
ícone e texto. O atalho que gira os modos (`panel-modes.ts`) nunca chega a ele e sai dele para
`default` ([D-10](decisions.md#f3--web)). Componente → hook → service, como os outros modos
([web/01](../../architecture/web/README.md)).

### B-13 — O alcance no card ✅

O tipo `PermissionRequest` ganha `reaches`, lido pelo mapper. O `PermissionCard` mostra um seletor
de alcance quando há mais de um, com o padrão de cada um, e o pré-selecionado da
[D-09](decisions.md#f2--alcance-das-regras). O alcance vale para `session`, `project` e `always`,
e a segunda etapa (`PersistConfirmation`) mostra todos os padrões. A resposta (`onAnswer` → hook →
service) leva `reach`. Pedido sem `reaches` funciona como hoje.

### B-14 — A marca ✅

`PermissionOutcomeLine` lê `via`: "aprovado automaticamente — Permitir tudo", "— por uma regra",
e o texto genérico de hoje para `via` ausente ou desconhecido.

---

## Cenários cobertos

S-69…S-82.

---

## Critério de conclusão

```bash
pnpm verify
```
