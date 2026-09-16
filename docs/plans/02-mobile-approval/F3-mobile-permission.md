# F3 — Permissão no app

Plano: [02 — Aprovação pelo celular](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-mobile-session.md).
**Entrega:** a tela que autoriza execução de comando na máquina do usuário, a partir de um
celular que está no bolso.

---

## É a razão de o app existir

E é a tela com mais regra específica do projeto inteiro. Duas delas não existem no desktop:

- **o toque acidental** — daí a confirmação em dois passos para tool destrutiva;
- **o aparelho desbloqueado no bolso** — daí a biometria, que é complementar à confirmação, não
  substituta. Uma protege contra o toque; a outra, contra o aparelho nas mãos erradas.

Leia [mobile/04-ui](../../architecture/mobile/04-ui.md#a-tela-de-permissão) antes de começar.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-20 — O card de permissão 🔲

Comando exato, monoespaçado, rolável e **sem truncar**; destaque derivado do `riskHint`
(`destructive` → `colorScheme.error`); contagem regressiva até `expiresAt`, porque silêncio
nega e o usuário precisa saber disso.

O escopo (`once` por default) é explícito na tela.

### B-21 — Confirmação em dois passos e alvo de toque 🔲

Tool destrutiva exige dois passos. Quando `defaultToNo`, aprovar **não** é o alvo mais fácil da
tela.

### B-22 — Biometria para aprovar 🔲

`local_auth`, ligada por default e desligável. Indisponível ou recusada → cai para o PIN do
dispositivo, **nunca** para "aprovar direto" ([mobile/07-auth](../../architecture/mobile/07-auth.md)).

### B-23 — Deep link que revalida no servidor 🔲

`/sessions/:sessionId/permissions/:requestId`, com guard de autenticação no `redirect` do
router.

A regra que não pode ser esquecida: **nunca renderize a partir do payload da notificação.** O
push pode ter atrasado, e a permissão pode já ter expirado ou sido resolvida em outro aparelho.

### B-24 — Estados da fila 🔲

`pending` enquanto envia, sem aceitar segundo toque; resolvida em outro dispositivo atualiza o
card sozinha; perder a corrida não é erro na tela — mostra quem resolveu.

### B-25 — Logout completo 🔲

Limpa o armazenamento seguro, fecha o socket, invalida os providers, **desregistra o push
token** e chama o `end_session_endpoint` do provedor.

Pular o desregistro faz o aparelho continuar recebendo notificação de permissão de uma conta da
qual ele saiu — e invalidar os providers é o que impede dado do usuário anterior de aparecer
para o próximo.

---

## Cenários cobertos

S-39…S-50.

---

## Critério de conclusão

```bash
pnpm verify
node scripts/mobile.mjs test:widget
```
