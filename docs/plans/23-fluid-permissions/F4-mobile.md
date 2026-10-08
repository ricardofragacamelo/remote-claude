# F4 — Mobile

Plano: [23 — Permissões fluidas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-rule-reach.md). Não depende da F3.
**Entrega:** o app liga e desliga Permitir tudo pelo chip de modo, o card deixa escolher o alcance,
e a linha da tool diz quando ninguém foi perguntado e por quê. Paridade com o web.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-15 — Permitir tudo no chip ✅

`offeredModes` ganha `allowAll`, com rótulo, descrição e aviso. O chip fica em tom de aviso com
ícone e texto, nunca só cor ([mobile/04-ui](../../architecture/mobile/04-ui.md)). O mapper de
sessão lê `allowAll`, e um modo desconhecido vira `default`.

### B-16 — O alcance no card ✅

`PermissionRequest` ganha `reaches`, lido pelo `permission_mapper`, que ignora alcance
desconhecido. O `permission_card_view` mostra o seletor quando há mais de um alcance, com o
pré-selecionado da [D-09](decisions.md#f2--alcance-das-regras), e a confirmação de
`project`/`always` mostra todos os padrões. A resposta leva `reach`.

### B-17 — A marca ✅

`PermissionOutcome` ganha `via`, lido pelo mapper. A `permission_outcome_line` diz "Permitir tudo"
ou "uma regra", e o texto genérico para valor ausente ou desconhecido.

---

## Cenários cobertos

S-83…S-94.

---

## Critério de conclusão

```bash
pnpm verify
```
