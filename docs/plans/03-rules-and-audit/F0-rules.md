# F0 — Regras

Plano: [03 — Regras e trilha](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [plano 01](../01-live-session/README.md) e [plano 02](../02-mobile-approval/README.md).
**Entrega:** uma decisão de permissão pode virar regra, a regra resolve pedidos futuros sem
incomodar ninguém, e pode ser retirada.

---

## O ponto delicado

A regra é uma **autorização antecipada** para executar comando na máquina do usuário. Tudo
nesta fase gira em torno de não conceder mais do que o usuário quis conceder: o casamento é
regra pura, testada por fronteira, e a UI que a cria (F1) diz o alcance com todas as letras.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-01 — `PermissionRule` no domínio 🔲

Escopo (`session`, `project`, `always`), tool, padrão de input, autor, validade e a decisão.
Pertence a um usuário — regra de um nunca resolve o pedido de outro.

`session` já existe desde a [F4 do plano 01](../01-live-session/F4-permission.md); o que nasce
aqui é o que **sobrevive** à sessão.

### B-02 — Tabela `permission_rules` e migration 🔲

Migration versionada. Regra viva de escopo `session` continua em memória: o que vai para o
banco é o que precisa sobreviver ao processo
([persistência](../../architecture/backend/05-persistence.md)).

### B-03 — Auto-resolução antes de notificar 🔲

A ordem da ponte não muda: idempotência por `requestId`, **depois** regra, **depois** cria o
pedido e espera ([a ponte](../../architecture/backend/04-claude-integration.md#a-ponte-de-permissão)).

Regra que resolve **não** emite `permission.requested` e **não** dispara push. O que ela emite
é `permission.resolved` com `auto: true` — o usuário precisa ver que algo foi autorizado em seu
nome.

### B-04 — `updatedPermissions` de volta ao SDK 🔲

Quando o usuário escolhe "sempre permitir", a decisão volta ao Claude por
`updatedPermissions`, além de virar regra nossa. Sem isso, as duas metades divergem: o SDK
continua perguntando o que nós já decidimos.

### B-05 — Revogar tem efeito imediato 🔲

Revogada a regra, o próximo pedido pergunta de novo — **inclusive em sessão que já está de
pé**. Regra revogada que continua valendo até reiniciar não é revogação.

### B-06 — Precedência e o `deny` de projeto 🔲

`deny` vence `allow` no mesmo escopo. E o `deny` das settings de projeto continua sendo
aplicado pelo CLI antes de nós — é a assimetria que joga a nosso favor e que está medida em
[descoberta §8.2](../../discovery/01-descoberta-claude-agent-sdk.md#82--a-assimetria-allow-vs-deny-entre-escopos).

Conflito entre regra e `permissionMode` da sessão resolve pelo mais restritivo.

---

## Cenários cobertos

S-01…S-14.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
