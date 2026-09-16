# F1 — Push

Plano: [02 — Aprovação pelo celular](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-device.md).
**Entrega:** o módulo `notification` — push traduzido, disparado só quando ninguém está
observando, e cancelado assim que a permissão deixa de existir.

> **Provedor decidido:** FCM direto ([D-03](decisions.md)), com o escopo em Android
> ([D-12](decisions.md)). O segredo é a credencial de service account e vive na configuração —
> criar o projeto do provedor e dizer quem o administra é trabalho de quem opera, e a fase se
> escreve sem ele.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-08 — Domínio `notification` e a porta 🔲

O módulo decide **como** notificar; **se** algo merece notificação quem decide é `permission`
([backend/03](../../architecture/backend/03-modules.md#notification)). A porta fica em
`application/notification/ports/`.

### B-09 — Adapter do provedor 🔲

`adapter/outbound/push/` é o **único** lugar que conhece o fornecedor, e nem o nome dele
aparece fora da configuração — mesma regra que vale para o provedor de identidade
([AGENTS.md](../../../AGENTS.md)).

Falha do provedor é `warn` e **não** derruba a permissão: o pedido continua válido no web, e o
timeout continua sendo quem decide no silêncio.

### B-10 — Quando disparar, e quando cancelar 🔲

Vai para **todos os aparelhos aprovados** do usuário, e é **uma notificação por pedido**, não uma
agrupada ([D-04](decisions.md#d-04--todos-ou-o-último), [D-15](decisions.md#d-15--três-pedidos-na-bandeja)):
é o que preserva o deep link por `requestId` e faz o toque abrir no card certo. O agrupamento
nativo do Android cuida da aparência.

Dispara quando **nenhuma** connection do usuário está observando aquela sessão. Cancela quando
a permissão resolve ou expira — pelo evento de domínio `permission.resolved`, já publicado na
[F4 do plano 01](../01-live-session/F4-permission.md).

Notificação para uma ação que não existe mais é a forma mais rápida de ensinar o usuário a
ignorar as notificações do app.

### B-11 — Catálogo de tradução do backend 🔲

`backend/src/shared/i18n/locales/{en,pt-BR}.json`, existindo **só** para isto: o SO do aparelho
não traduz, então o payload vai pronto, no `Device.locale`. É a única exceção da regra de i18n,
e está declarada como tal em [02-i18n](../../architecture/shared/02-i18n.md).

Escreva primeiro em `en`. Sem concatenar fragmento.

### B-12 — O que o payload carrega — e o que nunca carrega 🔲

Carrega `sessionId`, `requestId` e `expiresAt`, que é o que permite abrir direto no card certo.

**Nunca** carrega conteúdo de arquivo nem output de comando: o push passa por servidor de
terceiro. Esta é uma regra de segurança, não de economia de bytes.

### B-13 — Recebimento no app 🔲

Canal de notificação, permissão do SO pedida na hora certa (não no primeiro segundo do app),
toque abrindo o deep link, e `push.received` / `push.opened` no log —
[mobile/05-logging](../../architecture/mobile/05-logging.md).

Push token nunca vai inteiro para o log; só os seis últimos caracteres.

### B-31 — O token que morre calado 🔲

O app **reenvia o token a cada renovação** do provedor, e o backend **apaga o token que o
provedor recusa mantendo o device aprovado** ([D-13](decisions.md#d-13--o-token-que-morre-calado)).

O token era registrado no login e desregistrado no logout, sem nada entre os dois — e o FCM troca
o token e devolve "não registrado" para o antigo. Tratar isso como `warn`, que é o certo para um
blip, é o errado para uma condição permanente: a aprovação de longe para de chegar e ninguém
sabe.

Revogar o device seria cobrar nova aprovação pelo web a cada troca de token do SO.

### B-32 — Quando o usuário nega a notificação do SO 🔲

Estado próprio na UI: o app **explica com todas as letras** que sem notificação a aprovação só
acontece com ele aberto, e oferece o atalho para as configurações do SO
([D-14](decisions.md#d-14--o-usuário-que-nega-a-notificação)).

É o único caminho que faz o plano inteiro perder a função sem nada falhar. Recusar o aparelho
seria tirar o produto de quem apenas prefere abrir o app; ficar silencioso seria pior — o usuário
concluiria que o produto não notifica. O `patrol` dirige o diálogo do SO
([mobile/06-testing](../../architecture/mobile/06-testing.md)), então o caminho real é
exercitável.

---

## Cenários cobertos

S-15…S-26, S-61…S-64.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
```
