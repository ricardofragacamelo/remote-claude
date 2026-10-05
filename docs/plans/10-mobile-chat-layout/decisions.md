# Plano 10 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> O plano nasceu em 2026-10-02 de duas decisões que o usuário tomou no [plano 09](../09-chat-layout/decisions.md)
> (lá, D-17 e D-19), já fechadas. As outras oito nasceram ao planejar, cada uma com uma recomendação, e
> foram **respondidas pelo usuário em 2026-10-03**: as oito seguem a recomendação, e nenhuma muda tarefa
> ou cenário. A D-10 fechou o gap que tinha: o push em primeiro plano é mostrado pelo nativo.
>
> As decisões de **lugar** que o 09 fechou (D-04…D-16 de lá) valem aqui sem repetir a pergunta: a caixa
> até 40 %, enviar/parar híbrido, o motivo de não enviar, o menu "Commands" que sai, encerrar confirmado,
> o card na linha da tool, o foco que fica na caixa, as tarefas sobre a caixa, o desfazer na mensagem e
> no `⋯`, os verbos sorteados. E a [09 · D-05](../09-chat-layout/decisions.md#f1--moldura-do-painel): na
> sessão encerrada, enviar retoma.

---

## F0 — Normas

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | O que o app ganha | o app não mostra thinking, desenha as mensagens e depois as tools (fora da ordem), põe a fila de permissão acima da conversa e não tem modo, modelo, esforço, fila de prompts nem rascunho | escopo | **2026-10-02 — paridade com o painel web**, decisão do usuário (no 09, D-17; a recomendação era só o molde e o inline). Além das três faixas, da ordem real e do inline (indicador, thinking, permissão, plano), o app ganha o rascunho com modo, modelo e esforço, a fila de prompts, a lista de tarefas, o contexto da janela e as ações da mensagem (editar por fork, bifurcar, desfazer até aqui). **Fica fora:** o contexto do prompt (`@`, anexo, seleção do editor), os diffs e a view "Alterações", as abas de conversa, o subagent aninhado, exportar e a busca na conversa | ✅ |
| D-02 | A tela que a notificação abre continua? | com o card inline na conversa, a `PermissionPage` avulsa (plano 02) poderia sumir | B-22 | **2026-10-02 — continua**, decisão do usuário com a recomendação (no 09, D-19). A notificação abre o pedido, revalidado no servidor, como hoje. "Abrir sessão" leva à conversa com o card à vista | ✅ |
| D-03 | Quando este plano começa | as normas do app espelham as do web (a F0 do 09), mas o código do app não depende do código do web | F0 | **2026-10-03 — depois que o 09 fechou inteiro**, decisão do usuário com a recomendação. A condição já está cumprida: o 09 fechou em 2026-10-03 (F0…F5, `verify:full` verde, contrato sem mudança), então a F0 pode começar. O app espelha o que o web **provou**, e as duas pontas não disputam o e2e (R-07) | ✅ |
| D-04 | Como provar que os textos compartilhados são iguais no web e no app | o `i18n:check` compara chaves dentro de cada família, nunca entre elas; e as chaves têm convenções diferentes (`sessions.working.verbs.*` no web, camelCase nos ARB) | B-03 | **2026-10-03 — um mapa declarado**, decisão do usuário com a recomendação: chave do web → chave do app, só para os textos que as duas pontas mostram (os verbos, a pílula, o thinking, a faixa de encerrada). O `i18n:check` lê o mapa e compara texto a texto, por idioma (B-03). O fluxo de ARB do app não muda | ✅ |

## F1 — Moldura da sessão

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | O rascunho no app | hoje tocar na pasta abre a sessão na hora. O esforço só se escolhe antes da sessão (08 · D-16), então paridade com o esforço pede um momento antes do `session.start` | B-08, B-11 | **2026-10-03 — o rascunho, como no web** (08 · D-07), decisão do usuário com a recomendação: tocar na pasta abre a tela sem sessão, e a sessão nasce no primeiro prompt com o modelo, o modo e o esforço escolhidos. Nenhum subprocesso (~222 MB, conta no teto) existe só porque alguém abriu uma pasta para olhar | ✅ |

## F2 — Composer

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | O que cabe na barra em 360 dp | a barra tem seis controles, cada um com alvo de 48 dp; em 360 dp, com margem, cabem cerca de seis, e não sobra lugar para o texto do chip | B-10 | **2026-10-03 — a regra do 09 · D-04, com a largura medida**, decisão do usuário com a recomendação. `/`, modo e enviar/parar nunca saem da barra. Modelo, esforço e contexto vão para o `⋯` da barra abaixo da largura em que os seis não cabem, medida na B-10 em 360 dp e com fonte em 200 %. **Medida (B-10, 2026-10-03):** a largura não é um número fixo — a barra mede o texto de cada chip com a escala de fonte da pessoa (`barFits`) e decide a cada layout. Com os textos padrão (Perguntar · Sonnet · Alto · anel), os seis precisam de mais que 360 dp já em 100 %: no celular de 360 dp o modelo, o esforço e o contexto ficam sempre no `⋯`, e numa largura de tablet (600 dp) cabem em 100 % e vão para o `⋯` em 200 % (S-30) | ✅ |
| D-07 | Digitar `/` abre os comandos? | o app tem uma folha de comandos com busca; o web tem uma completion inline enquanto se digita | B-12 | **2026-10-03 — sim, a mesma folha**, decisão do usuário com a recomendação. Digitar `/` no início da caixa abre a folha de comandos, já filtrando pelo que vem depois, e o botão `/` da barra abre a mesma folha. Sem completion inline: o espaço acima do teclado é da fila e da pílula | ✅ |

## F3 — Cabeçalho

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-08 | Onde ficam o id e o custo da sessão | o web põe no tooltip do status e na status bar (09 · D-11); o app não tem tooltip de hover nem status bar | B-15 | **2026-10-03 — na folha que o toque no status abre**, decisão do usuário com a recomendação: o estado por extenso, o id (com copiar) e o custo desde que abriu. O resumo de cada turno continua na conversa | ✅ |

## F4 — Inline

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-09 | O gesto das ações da mensagem | o web mostra editar, bifurcar e desfazer ao passar o mouse; o celular não tem hover | B-24 | **2026-10-03 — pressionar e segurar**, decisão do usuário com a recomendação: abre uma folha com editar, bifurcar e desfazer, e as mesmas três são `Semantics` custom actions para o TalkBack (R-08). Nenhum `⋯` por prompt | ✅ |
| D-10 | O push de um pedido da sessão que está na tela | o que o app faz hoje com um push em primeiro plano — **a conferir** no `platform_push_gateway` e no handler de mensagem com o app aberto | B-22 | **2026-10-03 — suprimir só a notificação da sessão que está na tela**, decisão do usuário com a recomendação. Com a tela daquela sessão aberta, o pedido dela não gera notificação: o card inline, a pílula e o `liveRegion` bastam. Pedido de **outra** sessão continua notificando, e o toque abre a `PermissionPage` dele ([D-02](#f0--normas)). **Gap conferido:** hoje, em primeiro plano, quem mostra a notificação é o nativo (`PushMessagingService.onMessageReceived` → `PushNotifications.show`), sempre, e o Dart só loga a chegada (`PushController._onArrival`). Então a B-22 precisa que o Dart diga ao nativo qual sessão está visível (pelo `remote_claude/push`), e o nativo pula o `show` dessa sessão, nunca o `withdraw` | ✅ |

## F5 — Endereço de conexão

Nasceram em 2026-10-03, quando o usuário pediu a tela de endereço, e as oito foram respondidas na mesma
data. A D-15 dependia do que o spike da B-25 medisse, e a medida a confirmou. A D-19 nasceu do spike e
está em aberto.

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-11 | Onde entra a tela de endereço | não é layout do chat e mexe no login. Pode ser uma fase deste plano, um plano próprio, ou a F1 do [plano 19](../19-distribution/F1-exposure.md) (exposição) | F5 | **2026-10-03 — uma fase deste plano, antes do e2e**, decisão do usuário (a recomendação era um plano próprio). Entra como F5, e o e2e passa a ser a F10, que prova o layout e o endereço com a forma nova de subir o app. O plano só fecha com a D-15 resolvida | ✅ |
| D-12 | De onde vêm os endereços interno e externo | hoje o app só conhece o que vem do `--dart-define` ([app_config.dart](../../../mobile/lib/core/config/app_config.dart)) | B-27, B-28 | **2026-10-03 — da compilação**, decisão do usuário com a recomendação: `RC_INTERNAL_URL` e `RC_EXTERNAL_URL`, tirados do mesmo `.env` que já alimenta o build. Define vazio desabilita o radio, com o motivo. O **Outro** cobre o resto. Descoberta pelo backend, mDNS e QR ficam fora | ✅ |
| D-13 | O que o endereço escolhido muda | o issuer do OIDC é um define separado e precisa bater, caractere por caractere, com o `iss` que o backend valida | B-26, B-28 | **2026-10-03 — tudo sai de uma origem**, decisão do usuário com a recomendação: a API (`/api`), o WS (`/ws`) e o login (`/realms/<realm>`), como no modo público do web ([20 · D-01](../20-dev-public/decisions.md)). Trocar de origem pede um login novo, e o backend aceita o login de cada origem configurada ([D-15](#f5--endereço-de-conexão)) | ✅ |
| D-14 | Endereço sem TLS | o Android só aceita texto puro para `localhost` (`network_security_config.xml`) | B-28 | **2026-10-03 — só `https`/`wss`**, decisão do usuário com a recomendação, como o plano 19 já exige do backend fora do loopback ([19 · D-05](../19-distribution/decisions.md)). A exceção é `http://` para `localhost` e `127.0.0.1`, o caminho do dev e do e2e pelo `adb reverse`. O certificado da rede local é da infraestrutura. **Em 2026-10-04 a [D-20](#f6--instalação-por-usb) abriu a exceção da rede privada, só no build de debug** | ✅ |
| D-15 | Como o backend aceita o login de cada origem | o backend valida o `iss` contra um issuer só ([shared/08](../../architecture/shared/08-authentication.md#validação-no-backend)). Falta medir no Keycloak 26.x o `iss` sem `KC_HOSTNAME`, e se a JWKS é a mesma pelas duas origens — a [B-25](F5-connection-address.md) | B-26 | **2026-10-03 — uma lista explícita de issuers**, decisão do usuário com a recomendação. A configuração do backend ganha a lista dos issuers aceitos, cada um com o seu discovery e o seu cache de JWKS, e a mesma `aud`; o Keycloak fica sem hostname fixo, atrás dos cabeçalhos de proxy. Muda a regra "um issuer" do `shared/08`, então a B-26 abre uma ADR. **Condicionada ao spike da B-25:** se a medida mostrar que não funciona (a JWKS ou o discovery mudam por origem, por exemplo), a D-15 volta a 🔲 com o que se mediu, a B-26 fica travada e o usuário decide — nenhuma alternativa é adotada sem ele. **Medida (B-25, 2026-10-04), confirma:** num Keycloak 26.2.5 sem `KC_HOSTNAME` e com `KC_PROXY_HEADERS=xforwarded`, o discovery e o `iss` do token seguem a origem por onde foi chamado (direto na porta → `http://localhost:<porta>/realms/…`; pelo encaminhamento do Vite → `http://localhost:<web>/realms/…`; com `X-Forwarded-Host`/`-Proto` → a origem pública); a JWKS é **idêntica** pelas duas origens (mesmos `kid`, mesmo md5), e `kid`, `alg` e `aud` do token não mudam. O refresh token de uma origem é recusado pela outra (`invalid_grant`, issuer esperado) — por isso trocar de origem é um login novo (D-13). Registrado na [ADR-021](../../architecture/shared/00-decisions.md) | ✅ |
| D-16 | Onde fica a origem única no dev e no e2e | backend (`:3000`) e Keycloak (`:8180`) estão em portas separadas, e o encaminhamento por caminho só existe no modo público | B-27 | **2026-10-03 — o encaminhamento do Vite sempre ligado**, decisão do usuário com a recomendação: o do plano 20 passa a valer também no modo local, e o interno do dev e do e2e é `http://localhost:<porta do web>` pelo `adb reverse`. O console admin continua fora (20 · D-06) | ✅ |
| D-17 | O endereço da primeira abertura | sem escolha guardada, o app precisa de uma origem para o login | B-28 | **2026-10-03 — o interno; sem ele, o externo**, decisão do usuário com a recomendação. Sem nenhum dos dois, o app abre na tela de endereço | ✅ |
| D-18 | Onde a escolha fica guardada | o app só tem o `flutter_secure_storage`, e o logout limpa as credenciais dele | B-28 | **2026-10-03 — no aparelho, para não se perder**, pedido do usuário. A escolha e o texto do **Outro** ficam no `flutter_secure_storage`, em chaves `rc.connection.*` fora de `CredentialKeys.all`. Sobrevivem a reiniciar, ao logout, ao login e à atualização do app. O texto do **Outro** fica guardado com outro radio marcado. Só desinstalar o app ou limpar os dados dele os apaga | ✅ |

| D-19 | O `iss` no modo público (`pnpm dev:public`) | descoberta na B-25: o `docker-compose.public.yml` fixa o `KC_HOSTNAME` ([20 · D-08](../20-dev-public/decisions.md)), então no modo público **todo** token sai com o `iss` público. O radio **interno** do app (`http://localhost:<web>`) recebe, no discovery, o issuer público — que não bate com o issuer que o app deriva —, e o login por ele falha. O **externo** (a origem pública) funciona | só o modo público do dev; não bloqueia F5 nem F10 (o e2e não usa o modo público) | **recomendação:** tirar o `KC_HOSTNAME` do compose público e confiar nos `X-Forwarded-*`, que a B-25 mediu produzirem a origem pública — o que muda a 20 · D-08, decisão do usuário. Até lá, no modo público o app usa o radio externo | 🔲 |

## F6 — Instalação por USB

Nasceram em 2026-10-04, quando o usuário pediu um script que instale o app por USB com o endereço
interno tirado do IP da rede e o externo tirado do `pnpm dev:public`. A D-20 e a D-21 são escolhas do
usuário; a D-22 e a D-23 são o que as duas pedem para funcionar, e seguem a recomendação aceita.

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-20 | `http://` para o IP da rede local | a [D-14](#f5--endereço-de-conexão) só aceita `http://` para `localhost`. O interno pela rede é `http://<IP>:<web>`, e o app recusaria subir com ele (`plainText`) | B-34 | **2026-10-04 — aceito na rede privada, só no debug**, decisão do usuário com a recomendação. O `checkOrigin` aceita `http://` para um IPv4 literal de `10/8`, `172.16/12` e `192.168/16` quando `dart.vm.product` é falso. O release fica com a D-14 inteira. O `network_security_config.xml` de debug libera texto puro por `base-config`, porque o Android não aceita faixa de IP, e o filtro passa a ser o `checkOrigin`. Muda o `mobile/03` e o `mobile/04` | ✅ |
| D-21 | Que build o USB instala | release é menor e mais rápido, mas nunca vê o `network_security_config.xml` | B-36 | **2026-10-04 — APK de debug**, decisão do usuário com a recomendação: `flutter build apk --debug` e `adb install -r`. É o único build em que o interno pela rede funciona (D-20) | ✅ |
| D-22 | De onde vem cada endereço do instalador | o `.env` pode trazer `RC_INTERNAL_URL`/`RC_EXTERNAL_URL`, e o `pnpm dev:public` sem `RC_PUBLIC_URL` usa o domínio da conta, que só o túnel conhece | B-35, B-36 | **2026-10-04 — o que foi escrito vence o que foi descoberto.** Interno: `RC_INTERNAL_URL`, senão `http://<IP da rede>:<RC_WEB_PORT>`, e o IP é o `RC_LAN_ADDRESS` ou o da interface física. Externo: `RC_EXTERNAL_URL`, senão `RC_PUBLIC_URL`, senão a origem que o último `pnpm dev:public` abriu (`.run/public-origin`), senão vazio (radio desligado, com aviso). O console diz a origem de cada um. Com o `pnpm dev:public` de pé, o interno ainda esbarra na [D-19](#f5--endereço-de-conexão) | ✅ |
| D-23 | A stack atende pela rede | o servidor do web só escuta no loopback, e o backend só aceita o `iss` de `localhost` | B-35 | **2026-10-04 — o `pnpm dev` atende a rede local**, na linha da D-20: o Vite escuta em todas as interfaces no modo local, como o backend e o Keycloak já escutam, e o `withWebIssuer` soma o issuer do IP da rede aos aceitos ([ADR-021](../../architecture/shared/00-decisions.md)). O modo público não muda | ✅ |


## F7…F9 — Pastas e sessões no app

Nasceram em 2026-10-04, quando o usuário pediu, no app, abrir uma pasta e ver as sessões abertas nela, e
em seguida: várias pastas abertas, o histórico de sessões, criar sessão, abrir uma sessão que está
rodando e várias sessões abertas de uma pasta. Muda a [D-01](#f0--normas) num ponto — as abas de
conversa, que o app não ganharia, voltam como o painel lateral da D-26.

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-24 | Onde as sessões abertas de uma pasta aparecem | tocar na pasta abre o rascunho (D-05), e nada no app lê o `GET /sessions` | F8 | **2026-10-04 — numa tela da pasta**, decisão do usuário com a recomendação, no molde da view "Sessões do Claude" do web: **Nova sessão** (o rascunho), as abertas e o histórico. A D-05 continua valendo (nada roda até o primeiro prompt); muda só onde o rascunho começa — um toque a mais | ✅ |
| D-25 | As pastas abertas do app são as do web | o web guarda as abas no servidor (06 · D-14); o app podia ter as suas | F7 | **2026-10-04 — as mesmas do web**, decisão do usuário com a recomendação: o app lê e escreve `/workspaces/open-folders` e `/workspaces/recent`. Abrir no celular abre a aba no navegador, e o contrário; o teto é o mesmo (`OPEN_FOLDERS_LIMIT_REACHED`, 8) | ✅ |
| D-26 | Como trocar entre as sessões abertas de uma pasta | a D-01 deixou as abas de conversa fora do app | F9 | **2026-10-04 — um painel lateral da pasta, na tela da sessão**, decisão do usuário (a recomendação era uma faixa de chips acima da conversa, e o usuário escolheu primeiro a faixa e depois, na mesma data, a aba lateral). Arrastar da borda ou tocar no ícone da pasta na `AppBar` abre o painel (`Drawer`): as sessões abertas da pasta no app, cada uma com o ponto do status e os pedidos esperando, a da tela marcada, **Nova sessão** no alto, e a tela da pasta no fim. As outras continuam anexadas. Muda a D-01 nesse ponto. O painel não vira coluna fixa em tela larga — o tablet em duas colunas continua fora | ✅ |
| D-27 | Como navegar entre as pastas abertas | o app abre no esqueleto do ping | F7 | **2026-10-04 — a tela inicial lista as pastas abertas**, decisão do usuário com a recomendação: abertas (com sessões e pedidos de cada uma), recentes, e "Abrir outra pasta". O ping sai da rota inicial e fica alcançável pelo diagnóstico | ✅ |
| D-28 | O que guarda as sessões abertas no app, e até quando | o web guarda as abas de conversa no navegador; o app não tinha registro nenhum | B-44 | **2026-10-04 — em memória, por pasta**, tomada pelo agente na linha da D-26, **a confirmar pelo usuário**: o registro vive enquanto o app vive e não vai ao servidor nem ao disco. Fechar o app solta todas (nenhuma é encerrada); a tela da pasta lista as vivas de novo. Sem teto no app: o teto de sessões é o do servidor, que recusa o início como hoje | ✅ |
| D-29 | O que fica por baixo de uma sessão aberta por notificação | o push carrega só a sessão, o pedido e o prazo (02 · B-12), e a pasta da sessão só se sabe depois do `attach` | B-43 | **2026-10-04 — as Pastas**, tomada pelo agente na implementação, **a confirmar pelo usuário**: as rotas alcançáveis por endereço moram abaixo de `/`, então "voltar" de uma notificação chega nas Pastas em vez de fechar o app. Montar a pasta da sessão por baixo pediria a pasta no push (conteúdo a mais num servidor de terceiro) ou reordenar a pilha depois do `attach` (a tela mudaria de lugar sob o dedo). O rascunho e a sessão abertos **da pasta** voltam a ela | ✅ |

## F10 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-30 | Com que endereço a S-111 troca de origem no emulador | a B-30 pede **Outro** "com a mesma origem digitada" e que o login encerre; mas a tela só encerra o login quando a origem **muda** (S-101, S-103 e a [D-13](#f5--endereço-de-conexão): o token é do issuer da origem), e a stack do e2e não tem externo | B-30 | **2026-10-04 — a mesma stack por outra origem, `http://127.0.0.1:<web>`**, tomada pelo agente na execução, **a confirmar pelo usuário**: no aparelho, o `adb reverse` da porta do web vale para os dois nomes do loopback, e a stack do e2e passa a aceitar o issuer dele ao lado do de `localhost` (`scripts/lib/stack.mjs`). Assim a S-111 prova a troca inteira — confirmação, credenciais fora, login de novo pelo issuer novo, sessão aberta — em vez de uma troca que não muda nada. A mesma origem digitada continua sem encerrar o login, como a S-103 manda | ✅ |
| D-31 | Onde se prova o contraste da S-119 | a B-33 pede `textContrastGuideline` na tela de sessão, no emulador; medido, ele reprova um texto `#1D1B20` sobre `#FDF7FF` (≈ 16:1) com 1,7:1 — o guia captura a tela em pixels **lógicos** (1/2,625 no emulador), e com fonte de verdade o anti-aliasing vira tons de cinza (`c5c0c8`, `8d8990` — 25 % e 50 % da cor do texto) que são os mais frequentes da área | B-33 | **2026-10-04 — no teste de widget**, tomada pelo agente na execução, **a confirmar pelo usuário**: os quatro estados (rascunho, rodando, pedindo e encerrada) passam pelas três diretrizes em `draft_page_test` e `session_inline_test`, onde a fonte de teste desenha blocos sólidos e a medida vale — o nível da S-119 na matriz já era integração. No emulador ficam as duas diretrizes que não dependem da captura: alvo de toque e rótulo. A medida mostrou dois defeitos de verdade, corrigidos: o prompt da pessoa sem rótulo e o indicador fundido na linha da lista | ✅ |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 10-mobile-chat-layout`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
