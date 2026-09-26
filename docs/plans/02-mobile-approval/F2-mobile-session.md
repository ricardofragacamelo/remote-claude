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

### B-14 — `WsClient` com o contrato completo ✅

Os comandos do [plano 01](../01-live-session/F0-contract.md), reconexão com backoff exponencial
**com jitter**, `attach` com `resumeFromSeq`, e `connection.reauthenticate` quando o token
expira com o socket aberto.

Vive em `core/network/` e não conhece widget — [mobile/03](../../architecture/mobile/03-state-and-data.md).

**Feito em 2026-09-20.** O socket, a reconexão com jitter, o `resumeFromSeq` e o
`reauthenticate` já tinham nascido no [plano 01](../01-live-session/README.md); o que faltava era
o conjunto de comandos da sessão, que agora vive em `DriveSession` — `start`, `prompt`,
`interrupt` e `close`, cada um respondendo **se o comando saiu** (S-27, S-34, S-35).

### B-15 — As três regras do stream ✅

Descarta `seq <= lastSeq`; `gap: true` limpa o estado e recarrega por HTTP; `message.delta`
acumula **por `messageId`**.

São as mesmas do web porque o problema é o mesmo. Duas implementações que precisam concordar:
os cenários S-28…S-31 são escritos uma vez e valem para as duas pontas.

**Feito em 2026-09-20**, e o desenho mudou no caminho: a regra de arquitetura recusou
`presentation` importando `data`, e estava certa. O frame vira um **evento de domínio**
(`SessionEvent`) no mapper de `data/`, e o fold mora em `Conversation.apply` — então as três
regras se testam sem JSON, sem socket e sem widget. Um evento que este build não sabe ler vira
`UnreadEvent` e **mesmo assim anda com o `lastSeq`**: descartá-lo faria o cliente pedir o mesmo
evento de novo depois de toda reconexão, para sempre (S-77).

Uma ressalva do texto acima: o `gap` **limpa e reanexa**, não recarrega por HTTP. Não existe
endpoint de transcript — ele é o [plano 04](../04-transcript-and-resume/README.md) —, então o
reattach sem `resumeFromSeq` traz o que o ring buffer ainda tem, que é exatamente o que o web faz
hoje. Quando o transcript existir, é aqui que ele entra.

### B-16 — Ciclo de vida do app ✅

`paused` fecha o socket; `resumed` **revalida o token antes** de reconectar — depois de um
tempo em background ele provavelmente expirou, e reconectar com credencial morta produz um
`4401` evitável.

`AppLifecycleListener`. Nunca assuma que o socket sobreviveu ao retorno do background.

**Já existia desde o plano 01** (`app/lifecycle.dart`, `WsClient.suspend`/`resume`), e os
cenários S-32 e S-33 agora estão marcados contra os testes que já os provavam.

### B-17 — Telas de lista e de sessão ✅

Os **quatro** estados em toda tela que carrega dado: carregando, erro, vazio, conteúdo
([mobile/04-ui](../../architecture/mobile/04-ui.md)). Cor do `ColorScheme`, espaçamento de
token, tipografia do `TextTheme` — nada literal.

**Feito em 2026-09-20.** A lista é a de **workspaces** — é de onde uma sessão nasce, e o backend
não tem (nem deve ter) endpoint de "minhas sessões": a allowlist é decidida na máquina que roda o
backend, e um celular que pudesse acrescentar raiz seria um celular que aponta o Claude para
qualquer pasta. Os quatro estados vivem em `LoadedView`, escrito uma vez (S-37), e a tela de
sessão mostra a conversa, as tools com o **comando exato**, o custo do turno e por que a sessão
acabou. Prompt com socket caído não sai e a tela diz (S-76).

### B-18 — Provider de stream com `detach` obrigatório ✅

`ref.onDispose` chamando `detach` não é opcional: sem ele, navegar entre sessões acumula
subscrição e o app passa a processar evento de tela que já saiu.

**Feito em 2026-09-20** (S-36). E o portão achou um bug real de vizinhança: o callback de
`lastSeq` entregue ao `follow` **sobrevive** ao provider, e lia `state` — então uma reconexão
depois de sair da tela estourava "Ref usado depois de descartado", dentro do reconnect do socket.
Passou a ler um campo.

### B-19 — l10n das telas novas ✅

ARB em `en` e `pt`, com geração type-safe — chave inexistente vira erro de compilação, não
string crua na tela. Paridade verificada por `pnpm i18n:check`.

**Feito em 2026-09-20**: 26 chaves novas nos dois idiomas, e nenhuma string literal nas telas
novas. O S-38 é provado por máquina, não por teste de tela — `pnpm i18n:check` (portão 11) compara
os dois catálogos e o próprio verificador tem teste unitário.

---

## Cenários cobertos

S-27…S-38.

---

## Critério de conclusão

```bash
pnpm verify
node scripts/mobile.mjs test:widget
```
