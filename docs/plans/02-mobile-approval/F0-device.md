# F0 — Device

Plano: [02 — Aprovação pelo celular](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [plano 01](../01-live-session/README.md) inteiro.
**Entrega:** um aparelho pode ser registrado, aprovado a partir do web e revogado — e a
revogação alcança socket já aberto.

---

## Por que primeiro

Porque todo o resto do plano pressupõe um aparelho que **pode decidir**. Push para device
pendente é ruído; tela de permissão em device pendente é botão que não funciona. E a ordem
inversa cria a pior falha possível aqui: um aparelho aprovando execução de comando antes de
alguém ter dito que ele pode.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-01 — `Device` no domínio `auth` 🔲

Nome, plataforma, versão do app, `pushToken`, `locale` e o estado (`pending → approved →
revoked`). Ancorado no `User`, que por sua vez é ancorado no `sub` — nunca no e-mail
([08-authentication](../../architecture/shared/08-authentication.md#identidade-e-o-modelo-local)).

`Device.locale` é o que decide o idioma do push. Ausente, cai em `en`.

### B-02 — Tabela `devices` e migration 🔲

O índice único é **composto: `(user_id, install_id)`**
([D-10](decisions.md#d-10--o-mesmo-aparelho-duas-contas)), e nasce composto — depois seria
migration em tabela com dado. Com a chave simples, o registro do usuário B no mesmo celular
sobrescreveria a linha já aprovada do usuário A: aprovação herdada em silêncio, que é o oposto
do que esta fase existe para garantir.

Migration versionada; identidade estável do aparelho (um `installId` gerado pelo app) para que
reinstalar não crie um device fantasma a cada abertura.

### B-03 — Endpoints de device 🔲

Registrar, listar, aprovar e revogar, com os status do
[catálogo](../../architecture/shared/04-errors-and-http.md): `201` no registro, `403` para
device não aprovado, `404` para o que não é do usuário.

### B-04 — Revogação alcança socket aberto 🔲

Revogar fecha **na hora** as connections daquele device, com `4401`, e invalida os refresh
tokens dele. Sem isso, um aparelho revogado continua aprovando permissão até o token expirar —
ou seja, a revogação não revoga nada.

### B-05 — Guard de device nas ações que decidem 🔲

Observar sessão: permitido a device pendente. Responder permissão: só aprovado, com
`DEVICE_NOT_REGISTERED` ou `DEVICE_REVOKED`.

`401` diz "renove e repita"; `403` diz "não adianta insistir". Trocar os dois põe o app em laço
de renovação.

### B-06 — Tela de devices no web 🔲

Listar, aprovar e revogar, com a data do último uso. A aprovação parte de uma **sessão já
confiável** — um aparelho não aprova a si mesmo, e é isso que torna o registro uma prova.

Fecha a dívida que o bootstrap registrou em [web/07-auth](../../architecture/web/07-auth.md).

### B-07 — Registro e estado pendente no app 🔲

No primeiro login o app registra o aparelho e mostra o estado com todas as letras: enquanto
pendente, observa sessões e tem os controles de aprovação **desabilitados, com explicação**.

Esconder o motivo transforma regra de segurança em bug aparente
([mobile/07-auth](../../architecture/mobile/07-auth.md)).

### B-30 — O pendente que ninguém aprovou expira 🔲

Registro pendente há mais de **7 dias** sai da lista
([D-11](decisions.md#d-11--o-pendente-esquecido)). Registrar de novo é abrir o app.

A máquina de estados era `pending → approved → revoked`, sem saída para o aparelho que ninguém
aprovou — ele ficaria na lista para sempre, e lista longa de pendentes é como se aprova por
cansaço o aparelho errado, meses depois. Sem teto de aparelhos: o número não é o problema, a
idade é.

Expirar duas vezes não muda nada, e o aparelho no 6º dia continua aprovável.

---

## Cenários cobertos

S-01…S-14, S-59, S-60.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
