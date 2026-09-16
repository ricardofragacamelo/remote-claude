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
Pertence a um usuário — regra de um nunca resolve o pedido de outro
([D-03](decisions.md#d-03--de-quem-é-a-regra)).

O padrão usa a **gramática do próprio Claude Code** — `Bash(git status)` casa exato,
`Bash(git status:*)` casa o prefixo, `Bash` casa a tool inteira; sem glob e sem regex
([D-01](decisions.md#d-01--a-sintaxe-é-a-superfície-de-ataque)). É a mesma gramática que a B-04
devolve ao SDK: sintaxe diferente é a nossa metade e a dele casando conjuntos diferentes.
Padrão fora da gramática é recusado na **criação** (S-47), e o prefixo respeita fronteira de
token — `git status:*` não cobre `git statusx` (S-48).

Toda regra tem `expiresAt`, com default e teto vindos de configuração
([D-02](decisions.md#d-02--regra-que-expira)). Regra expirada não resolve nada (S-12) e **não
some da lista**: fica marcada como expirada, porque "sumiu" e "deixou de valer" são coisas
diferentes para quem procura o que autorizou.

`session` já existe desde a [F4 do plano 01](../01-live-session/F4-permission.md); o que nasce
aqui é o que **sobrevive** à sessão.

### B-02 — Tabela `permission_rules` e migration 🔲

Migration versionada, com `user_id` e `expires_at` **`NOT NULL`**. Regra viva de escopo
`session` continua em memória: o que vai para o banco é o que precisa sobreviver ao processo
([persistência](../../architecture/backend/05-persistence.md)).

Validade acima do teto configurado é recusada na criação, não truncada em silêncio (S-49).

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

S-01…S-14, S-47…S-49.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
