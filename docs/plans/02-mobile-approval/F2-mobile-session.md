# F2 — Sessão no app

Plano: [02 — Aprovação pelo celular](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-push.md).
**Entrega:** o app acompanha uma sessão viva — socket, ciclo de vida, stream coerente e as
telas de lista e de sessão.

---

## O problema desta fase

O celular perde conexão o tempo todo, e **isso não é falha**: em background o socket cai por
desenho, porque segurá-lo drena bateria e o SO o mata de qualquer forma. Toda a fase existe
para que perder o socket seja um evento comum e sem consequência — reconectar, pedir replay,
seguir.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-14 — `WsClient` com o contrato completo 🔲

Os comandos do [plano 01](../01-live-session/F0-contract.md), reconexão com backoff exponencial
**com jitter**, `attach` com `resumeFromSeq`, e `connection.reauthenticate` quando o token
expira com o socket aberto.

Vive em `core/network/` e não conhece widget — [mobile/03](../../architecture/mobile/03-state-and-data.md).

### B-15 — As três regras do stream 🔲

Descarta `seq <= lastSeq`; `gap: true` limpa o estado e recarrega por HTTP; `message.delta`
acumula **por `messageId`**.

São as mesmas do web porque o problema é o mesmo. Duas implementações que precisam concordar:
os cenários S-28…S-31 são escritos uma vez e valem para as duas pontas.

### B-16 — Ciclo de vida do app 🔲

`paused` fecha o socket; `resumed` **revalida o token antes** de reconectar — depois de um
tempo em background ele provavelmente expirou, e reconectar com credencial morta produz um
`4401` evitável.

`AppLifecycleListener`. Nunca assuma que o socket sobreviveu ao retorno do background.

### B-17 — Telas de lista e de sessão 🔲

Os **quatro** estados em toda tela que carrega dado: carregando, erro, vazio, conteúdo
([mobile/04-ui](../../architecture/mobile/04-ui.md)). Cor do `ColorScheme`, espaçamento de
token, tipografia do `TextTheme` — nada literal.

### B-18 — Provider de stream com `detach` obrigatório 🔲

`ref.onDispose` chamando `detach` não é opcional: sem ele, navegar entre sessões acumula
subscrição e o app passa a processar evento de tela que já saiu.

### B-19 — l10n das telas novas 🔲

ARB em `en` e `pt`, com geração type-safe — chave inexistente vira erro de compilação, não
string crua na tela. Paridade verificada por `pnpm i18n:check`.

---

## Cenários cobertos

S-27…S-38.

---

## Critério de conclusão

```bash
pnpm verify
node scripts/mobile.mjs test:widget
```
