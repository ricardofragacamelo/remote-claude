# F1 — Permitir tudo

Plano: [23 — Permissões fluidas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-norms.md).
**Entrega:** o backend aceita `allowAll`, nunca o repassa ao SDK, aprova sozinho toda tool que
não seja pergunta e que nenhuma regra recuse, resolve os cards pendentes ao ligar, e volta a
perguntar na próxima tool ao desligar.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-04 — O modo no domínio e no SDK ✅

`allowAll` em `PERMISSION_MODES`, e uma função pura `sdkPermissionMode(mode)` no mesmo arquivo:
`allowAll` → `default`, os outros como são. Usada nos dois lugares onde o modo chega ao SDK: o
`buildSdkOptions` e o `SessionRunner.setPermissionMode`. A entidade `Session` guarda o modo nosso,
porque é ele que o pedido de permissão lê.

### B-05 — A aprovação automática ✅

Na `RequestPermissionUseCase`, depois da regra e antes do card:

1. idempotência, como hoje;
2. o livro de regras, como hoje. Um `deny` recusa e um `allow` responde com `via: 'rule'`;
3. **novo:** se o modo **do pedido** é `allowAll`, a tool não está em `HUMAN_ONLY_TOOLS`
   ([D-05](decisions.md#f1--permitir-tudo)) e a leitura das regras **não falhou**
   ([D-12](decisions.md#f1--permitir-tudo)), o pedido é resolvido `allow`, `auto: true`,
   `resolvedBy` o dono da sessão, `scope: 'once'`, `ruleId` nulo, com `announce: true`;
4. senão, o card, como hoje.

Para o passo 3 saber que a leitura falhou, o `PermissionRuleBook` passa a devolver o motivo de
não ter regra (nenhuma casou, ou falhou ao ler), e não só `null`. `HUMAN_ONLY_TOOLS` é constante
do domínio (`domain/permission`). A resolução por modo é logada em `debug`, sem o input (S-20).

### B-06 — Ligar e desligar ✅

A `SetSessionPermissionModeUseCase`, ao trocar **para** `allowAll`, pede ao módulo de permissão
que reavalie os pendentes da sessão (`PermissionRegistry.pendingFor`): cada um passa pelos passos 2
e 3 da B-05 de novo, com o modo novo. Quem uma regra recusa é recusado, quem é pergunta fica, e
o resto é aprovado ([D-06](decisions.md#f1--permitir-tudo)). Desligar não precisa de nada: o modo
é lido a cada pedido. A porta entre `session` e `permission` segue a
[comunicação entre módulos](../../architecture/backend/03-modules.md#comunicação-assíncrona).

### B-07 — Os handlers ✅

`session.start` e `session.setPermissionMode` aceitam `allowAll` pelo guard gerado, e recusam o
resto com `INVALID_INPUT` antes de tocar a sessão. Log de entrada e saída em `debug` como os
outros comandos.

---

## Cenários cobertos

S-05…S-30, S-99, S-100.

---

## Critério de conclusão

```bash
pnpm verify
```
