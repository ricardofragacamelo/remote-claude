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

### B-20 — O card de permissão ✅

Comando exato, monoespaçado, rolável e **sem truncar**; destaque derivado do `riskHint`
(`destructive` → `colorScheme.error`); contagem regressiva até `expiresAt`, porque silêncio
nega e o usuário precisa saber disso.

O escopo (`once` por default) é explícito na tela.

**Feito em 2026-09-24.** `PermissionCardView` em `features/permission/`: o comando inteiro num
`SelectableText` monoespaçado, rolável nos dois eixos e sem `maxLines`; borda, ícone e frase do
risco, com `colorScheme.error` para `destructive` nos dois temas; a contagem até `expiresAt` e o que
cada escopo alcança. A contagem vive no controller, num tick de um segundo que só roda enquanto há
card: chegou a zero, o card sai como negado sem pedir nada (S-39, S-40, S-81, S-85).

### B-21 — Confirmação em dois passos e alvo de toque ✅

Tool destrutiva exige dois passos. Quando `defaultToNo`, aprovar **não** é o alvo mais fácil da
tela.

**Feito em 2026-09-24.** A regra é do domínio (`PermissionQueue.stepFor`): um "sim" destrutivo arma,
e só o segundo passo envia; "não" nunca espera. Com `defaultToNo`, negar é o `FilledButton` de
largura inteira acima de cada "sim", e no segundo passo "voltar" é o alvo maior (S-41, S-42).

### B-22 — Biometria para aprovar ✅

`local_auth`, ligada por default e desligável. Indisponível ou recusada → cai para o PIN do
dispositivo, **nunca** para "aprovar direto" ([mobile/07-auth](../../architecture/mobile/07-auth.md)).

**Feito em 2026-09-24.** `local_auth` atrás da porta `ApprovalLock`, com `biometricOnly: false` — o
PIN do aparelho é o degrau de baixo, e qualquer resposta que não seja "confirmado" é "não".
`GateApproval` decide na ordem que o [D-25](decisions.md#d-25--o-que-a-chave-desliga) fixou: sem
bloqueio não aprova, com a chave em qualquer posição (D-07). A chave fica na tela inicial. A
`MainActivity` passou a `FlutterFragmentActivity`, que o prompt exige (S-43, S-44, S-83).

### B-23 — Deep link que revalida no servidor ✅

`/sessions/:sessionId/permissions/:requestId`, com guard de autenticação no `redirect` do
router.

A regra que não pode ser esquecida: **nunca renderize a partir do payload da notificação.** O
push pode ter atrasado, e a permissão pode já ter expirado ou sido resolvida em outro aparelho.

**Feito em 2026-09-24.** `PermissionPage` na rota aninhada da sessão. Revalidar é
`GET /sessions/:sessionId/permissions/:requestId` ([D-22](decisions.md#d-22--revalidar-é-perguntar-não-esperar)),
que o backend ganhou nesta fase; até ele responder a tela diz que está conferindo, mesmo com o frame
já no socket. Depois, o stream vence a resposta. O provider da consulta não re-tenta sozinho: a
pessoa tem o botão (S-45, S-46, S-47, S-57, S-79, S-80).

### B-24 — Estados da fila ✅

`pending` enquanto envia, sem aceitar segundo toque; resolvida em outro dispositivo atualiza o
card sozinha; perder a corrida não é erro na tela — mostra quem resolveu.

**Feito em 2026-09-24.** A fila reage a eventos, nunca ao próprio otimismo: o card fica em
`sending` até o `permission.resolved`, e ele diz quem ganhou — navegador, celular, regra ou prazo.
Aparelho que não decide, socket caído e frame ainda não reentregue desligam os controles com o
motivo escrito. Para caber ao lado da conversa, o `WsClient` passou a aceitar vários assinantes por
sessão e a entregar frames `request` e `error` ([D-24](decisions.md#d-24--duas-telas-um-socket))
(S-48, S-49, S-82, S-84, S-86, S-87).

### B-25 — Logout completo ✅

Limpa o armazenamento seguro, fecha o socket, invalida os providers, **desregistra o push
token** e chama o `end_session_endpoint` do provedor.

Pular o desregistro faz o aparelho continuar recebendo notificação de permissão de uma conta da
qual ele saiu — e invalidar os providers é o que impede dado do usuário anterior de aparecer
para o próximo.

**Feito em 2026-09-24.** Na ordem do [D-23](decisions.md#d-23--a-ordem-do-logout): o device
registra em `core/session/` o passo que esquece o push token, o logout roda esse passo **antes** de
mexer no próprio estado, e só então limpa o armazenamento e chama o `end_session_endpoint`.
`app/session_scope.dart` fecha o socket e invalida os providers com dado do usuário ao ver "ninguém
logado", e abre o socket com a credencial nova no login seguinte (S-50, S-88, S-89).

### B-33 — Estender o prazo pelo celular ✅

Ação no card, ao lado da contagem regressiva ([D-16](decisions.md#d-16--estender-pelo-celular)).
O comando `permission.extend` nasceu na [F0 do plano 01](../01-live-session/F0-contract.md) e o
app não tinha como usá-lo — B-20 desenhava a contagem e mais nada.

Quem decide de longe é quem tem menos contexto para decidir depressa, e a alternativa — deixar
expirar e esperar o Claude perguntar de novo — é pior para a mesma sessão.

**O app manda o comando, não escolhe o número:** incremento e teto vêm da configuração do
backend. Os dois casos de borda são obrigatórios: teto atingido, e extensão que chega depois de
o pedido já ter sido resolvido.

**Feito em 2026-09-24.** "Quero mais tempo" no card manda só o `requestId`. O `permission.extended`
move a contagem e diz quantas extensões restam; no teto, ou quando o servidor recusa com o teto, a
ação some e a frase diz por quê. A recusa de extensão para pedido já encerrado não revive nem
reescreve o card: quem o tira da tela é o `permission.resolved` (S-65, S-66).

---

## Cenários cobertos

S-39…S-50, S-65, S-66, S-79…S-89.

---

## Critério de conclusão

```bash
pnpm verify
node scripts/mobile.mjs test:widget
```
