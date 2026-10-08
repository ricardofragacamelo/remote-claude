# Proposta — O remote-claude como app desktop (Tauri)

**Estado:** discovery. Nenhum plano criado, nenhum código escrito.
**Criada em:** 2026-10-08, a partir de uma conversa com o usuário: "teria como a interface web que
criamos rodar como desktop?", e, na sequência, "não só a interface: subir o back, banco, tudo
empacotado e rodar a interface — gostaria de usar Tauri". Ele pediu explicitamente que isto fosse
**só uma discovery**, sem plano ainda.
**Destino:** servir de insumo para um plano em [docs/plans/](../plans/README.md). Esta proposta
**não** é um plano: não tem tarefas com ID nem critério de conclusão por comando. Ela fixa o **quê** e
o **porquê**, mede o que já dá para medir, aponta o conflito com o
[plano 19 — Distribuição](../plans/19-distribution/README.md) e lista o que falta decidir.

---

## Sumário

1. [O pedido](#1-o-pedido)
2. [Vocabulário](#2-vocabulário)
3. [Princípios](#3-princípios)
4. [O que já foi decidido na conversa](#4-o-que-já-foi-decidido-na-conversa)
5. [Estado atual: como o sistema sobe hoje](#5-estado-atual-como-o-sistema-sobe-hoje)
6. [Arquitetura alvo](#6-arquitetura-alvo)
7. [Componente a componente](#7-componente-a-componente)
8. [O login dentro da janela — o achado principal](#8-o-login-dentro-da-janela--o-achado-principal)
9. [Ciclo de vida do app](#9-ciclo-de-vida-do-app)
10. [Celular e exposição](#10-celular-e-exposição)
11. [Tamanho, boot e build](#11-tamanho-boot-e-build)
12. [Relação com o plano 19](#12-relação-com-o-plano-19)
13. [Decisões em aberto](#13-decisões-em-aberto)
14. [Riscos](#14-riscos)
15. [Matriz de cenários (semente)](#15-matriz-de-cenários-semente)
16. [Fatiamento sugerido](#16-fatiamento-sugerido)
17. [Referências](#17-referências)

---

## 1. O pedido

Hoje, para usar o remote-claude, alguém clona o repositório e roda `pnpm dev`. O script sobe o
Postgres e o Keycloak pelo `docker compose`, espera o realm, sobe o backend e o Vite e imprime as
URLs. Depois a pessoa abre o navegador.

O pedido é um **app desktop instalável**, feito em Tauri, que resolva tudo isso num clique: sobe o
banco, o provedor de identidade e o backend, e abre a interface numa janela própria. O celular
continua sendo o outro cliente, e o produto não muda.

## 2. Vocabulário

| Termo | Sentido aqui |
|---|---|
| **Casca** (shell) | o processo Tauri: janela, bandeja, menu, orquestração dos outros processos. Escrito em Rust. |
| **Webview** | o motor que desenha a janela. O Tauri usa o do sistema: **WebKitGTK** no Linux, **WKWebView** no macOS, **WebView2** (Chromium) no Windows. |
| **Sidecar** | binário externo que o Tauri empacota e executa (`bundle.externalBin`, com o *target triple* no nome). Aqui é o backend Node. |
| **Pilha** | Postgres + Keycloak, os dois serviços do [docker-compose.yml](../../docker-compose.yml). |
| **Primeira execução** | a primeira vez que o app abre numa máquina: cria a pilha, o realm e o usuário. |

## 3. Princípios

1. **O desktop é casca e orquestrador, não um quarto cliente.** A interface é o mesmo `web/dist`.
   Nenhuma tela é reescrita e nenhuma regra de negócio vai para o Rust.
2. **O contrato não muda.** REST, WebSocket, OIDC e o protocolo do
   [05-websocket-protocol](../architecture/shared/05-websocket-protocol.md) continuam iguais. O
   celular não sabe se o backend foi subido por `pnpm dev` ou pelo app.
3. **O app roda como o usuário.** O backend herda `~/.claude/.credentials.json` porque é filho de um
   processo do próprio usuário. O [R-02 do plano 19](../plans/19-distribution/README.md#riscos-e-decisões-em-aberto)
   (o serviço do SO que não acha a credencial) deixa de existir enquanto o app estiver aberto.
4. **Loopback por padrão continua valendo.** Abrir uma janela não muda quem alcança o backend: quem
   chega nele executa comando na máquina
   ([04-claude-integration](../architecture/backend/04-claude-integration.md#autenticação--não-faça-nada)).
5. **OIDC padrão, sem atalho de desktop.** O backend continua validando token e nunca emitindo
   ([ADR-010](../architecture/shared/00-decisions.md#adr-010--openid-connect-agnóstico-de-provedor-auth0-como-alvo-inicial)).
   "É local, então pula o login" não entra.

## 4. O que já foi decidido na conversa

| Pergunta | Resposta do usuário (2026-10-08) | O que muda |
|---|---|---|
| Tecnologia da casca | **Tauri** | WebKitGTK/WKWebView fora do Windows: ver §8 e R-01 |
| Plano ou discovery | **Só discovery, sem plano** | este documento |
| Como o Postgres roda | **Docker** | Docker passa a ser pré-requisito de quem **usa** o app, e não só de quem desenvolve. Responde a [D-03 do plano 19](../plans/19-distribution/decisions.md#d-03--quem-carrega-o-banco). |
| Como o login roda | **Keycloak + JRE embutidos**, descartando um IdP leve em Node e um IdP externo | ver a D-01 abaixo: com Docker já obrigatório, a forma natural disso é a imagem oficial, que já é "Keycloak + JRE" |
| Sistemas operacionais | **Manter a [D-01 do plano 19](../plans/19-distribution/decisions.md)**: Linux, macOS e Windows, teste automatizado só no Linux | build em matriz de CI, um sidecar por *target triple* |

## 5. Estado atual: como o sistema sobe hoje

| Peça | Como sobe em `pnpm dev` | Fato relevante para empacotar |
|---|---|---|
| Postgres 18 | `docker compose`, imagem `postgres:18-alpine` (304 MB local), volume `postgres-data` | já com healthcheck e portas por variável |
| Keycloak 26.2 | `docker compose`, `start-dev --import-realm`, imagem de 451 MB, store H2 no volume | o realm importado traz **2 usuários de desenvolvimento com senha**, e o admin é `admin/admin` em [.env.example](../../.env.example) |
| Backend | `tsx watch src/main.ts`, **sem passo de build** ([backend/package.json](../../backend/package.json)) | `emitDecoratorMetadata` desligado de propósito, então um bundle com esbuild não perde a injeção do Nest |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` 0.3.277 | traz um binário do Claude Code **por plataforma**: `claude-agent-sdk-linux-x64` tem **224 MB** |
| Web | Vite em dev; `vite build` gera `web/dist` (**7,9 MB**) | `VITE_API_URL`, `VITE_WS_URL` e o issuer entram **no build** ([web/env.ts](../../web/env.ts)): porta e origem ficam congeladas no bundle |
| Sessão do web | o backend troca o code e grava o refresh num cookie `rc_refresh` com `httpOnly`, `secure`, `sameSite: 'strict'` e `path: /auth` ([refresh-cookie.ts](../../backend/src/adapter/inbound/http/auth/refresh-cookie.ts)) | é o centro do §8 |
| Servir o web | **ninguém**: o backend não serve estáticos | é a [D-02 do plano 19](../plans/19-distribution/decisions.md), em aberto |
| Migrations | `pnpm db` (CLI do backend) | o plano 19 · B-03 já previa aplicar na subida |

## 6. Arquitetura alvo

```
┌──────────────────────── app remote-claude (Tauri, roda como o usuário) ───────────────────────┐
│                                                                                               │
│  casca Rust ── bandeja · janela · primeira execução · logs · "sair de verdade"                │
│     │                                                                                         │
│     ├─ 1. docker compose -p remote-claude-desktop up -d   (Postgres 18 + Keycloak 26.2)        │
│     │        └── espera os healthchecks (os mesmos do compose de dev)                          │
│     ├─ 2. sidecar: node backend.mjs   (migrations → NestJS em 127.0.0.1:<porta>)              │
│     │        ├── serve /api, /ws **e** o web/dist estático (mesma origem)                     │
│     │        └── Agent SDK → binário do Claude Code → ~/.claude (login do usuário)            │
│     └─ 3. janela → http://127.0.0.1:<porta>/   (o webview carrega o backend, não tauri://)    │
│                                                                                               │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ celular: pelo endereço externo da infraestrutura (D-04 do plano 19), sem mudança
```

Por que a janela aponta para o backend, e não para os arquivos embutidos no Tauri: a origem
`tauri://localhost` (ou `http://tauri.localhost` no Windows) é **outro site** para o cookie
`sameSite: 'strict'`. Com ela, o refresh nunca seria enviado (§8). Servir o web pelo backend responde
à D-02 do plano 19 e deixa a janela igual a uma aba do navegador: mesma origem, mesmo redirect OIDC
(`http://127.0.0.1/*` já está no client `remote-claude-web` do realm) e mesmo e2e.

## 7. Componente a componente

### 7.1 A casca Tauri

- **Tauri 2** (2.11.x em julho de 2026), em `desktop/` como workspace novo. A pasta precisa entrar
  no [07-repository-layout](../architecture/shared/07-repository-layout.md) antes de ser criada.
- Plugins: `shell` (sidecar), `single-instance` (duas janelas = dois backends disputando a porta),
  `updater` (com assinatura), `log` e a bandeja nativa.
- Responsabilidades: verificar pré-requisitos (Docker rodando, `~/.claude/.credentials.json`
  presente), orquestrar a ordem de subida e de descida, mostrar o progresso e o erro com tradução
  (`en`, `pt-BR`), e logar em `debug` toda borda, como manda a regra 3 do AGENTS.md.
- O Rust não ganha regra de negócio. Se uma lógica começa a crescer ali, ela pertence ao backend.

### 7.2 Backend como sidecar

- **Precisa de um passo de build**, que hoje não existe: bundle ESM com esbuild (sem
  `emitDecoratorMetadata`, nada se perde) + `node_modules` de produção para o que não empacota (o
  binário do SDK, nativos futuros).
- **Runtime Node**: levar o binário `node` de cada plataforma (123 MB no Linux, descomprimido) e
  usá-lo como sidecar, com o bundle como recurso. A *single executable application* do Node é a
  alternativa, mas o código é ESM e o SDK precisa do binário ao lado. Fica para medir (D-03).
- **Binário do Claude Code**: o do SDK (224 MB por plataforma, versão casada) ou o `claude` já
  instalado na máquina via `pathToClaudeCodeExecutable`
  ([discovery 01 §2](01-descoberta-claude-agent-sdk.md#qual-binário-roda)). É a D-02.
- **Porta**: fixa e configurável, ou escolhida livre a cada subida. Escolher livre exige que o web
  leia a configuração em tempo de execução (§7.3).
- **Futuros nativos**: o terminal do [plano 12](../plans/12-integrated-terminal/README.md) vai
  precisar de PTY, e um módulo nativo precisa ser compilado por plataforma no CI. O ripgrep do plano 11
  já é a [D-08 do plano 19](../plans/19-distribution/decisions.md#d-08--o-binário-do-ripgrep).

### 7.3 Web

- Servido **pelo backend**, na mesma origem (§6). Isso pede rota estática com *fallback* para o
  `index.html` (o router é do lado do cliente) e CSP própria.
- Configuração em tempo de execução: com a mesma origem, `VITE_API_URL` e `VITE_WS_URL` viram
  caminhos relativos e deixam de depender da porta. O issuer OIDC continua de fora: ou fica fixo no
  build do desktop, ou vem de um `/config.json` servido pelo backend. Essa segunda forma também
  serve ao plano 19.
- Nada muda na cadeia Component → Hook → Service → api.

### 7.4 Postgres e Keycloak (Docker)

- Um compose **próprio do desktop**, com outro `--project-name` (`remote-claude-desktop`), outros
  volumes e portas. Assim o app instalado nunca toca no ambiente de `pnpm dev` da mesma máquina.
- **Keycloak em modo de produção** (`start` em vez de `start-dev`) com Postgres como store, no
  lugar do H2 de dev. Essa é a forma suportada para dados que precisam durar. A outra opção é manter o
  H2, aceitando que ele não é para produção (D-05).
- **Realm de distribuição**: o mesmo realm, **sem os usuários de dev** e sem o client `e2e`. A
  primeira execução cria o usuário do dono pela Admin API, com a senha que ele digitar. A senha de
  admin do Keycloak é gerada na instalação e guardada no cofre do SO (Secret Service, Keychain,
  Credential Manager), nunca num `.env` em texto.
- **Imagens**: baixadas na primeira execução (~755 MB somando as duas medidas aqui) ou levadas no
  instalador (`docker load`). Baixar exige rede; levar triplica o instalador (D-06).

## 8. O login dentro da janela — o achado principal

O web guarda o refresh token num cookie `secure`. O comentário em
[refresh-cookie.ts](../../backend/src/adapter/inbound/http/auth/refresh-cookie.ts) diz:
"browsers treat `localhost` as a trustworthy origin". Isso vale para **Chromium e Firefox**, mas
**não para o WebKit**. O WebKit não aceita cookie `Secure` de página `http://localhost`, apesar de
dar `window.isSecureContext === true` (WebKit bugs 218980, 231035, 232088, abertos).

A consequência é que o Tauri, no **Linux (WebKitGTK)** e no **macOS (WKWebView)**, carregando
`http://127.0.0.1`, **não grava o `rc_refresh`**. O login funciona, mas a sessão morre quando o
access token vence, e cada recarga volta para a tela de login. No Windows (WebView2) funciona. Isso
vem de bug reportado, **não foi medido aqui**. É o primeiro spike (§16).

Saídas possíveis (D-04):

| Opção | Como | Custo |
|---|---|---|
| **(a) HTTPS em loopback** | a casca gera um certificado para `127.0.0.1`, e o backend escuta em TLS | o webview precisa confiar no certificado. Aceitar certificado inválido no webview é uma brecha, e instalar uma CA local é uma operação de root por SO. |
| **(b) A casca serve a origem** | um *custom protocol* do Tauri faz proxy de `/api` e `/auth` para o backend, e o cookie vive na casca | outra origem (`tauri://`), CORS e WebSocket passando pelo proxy. Muda o caminho que o e2e cobre. |
| **(c) Cookie sem `secure` só em loopback** | o backend emite sem `secure` quando a requisição veio de `127.0.0.1` | enfraquece uma regra que hoje vale sempre ("flag only on in production is a flag nobody tests"). Exige ADR. |
| **(d) WebView2/Chromium em todo SO** | trocar a casca por Electron, ou usar CEF | contraria a escolha do Tauri |

Ainda sobre o login: a tela do Keycloak abre **dentro** da janela. O RFC 8252 recomenda navegador
externo para app nativo, para que o app não veja a senha. Aqui o IdP é local e do próprio usuário, e
o fluxo é o mesmo do web (redirect para a origem), então o risco é pequeno. Mesmo assim, a escolha
precisa ficar registrada (D-07).

## 9. Ciclo de vida do app

| Momento | O que acontece |
|---|---|
| **Primeira execução** | verifica Docker e o login do Claude → gera os segredos → sobe a pilha → importa o realm → pede nome e senha do dono → cria o usuário → aplica as migrations → abre a janela |
| **Abrir** | `single-instance` → `compose up -d` (idempotente) → healthchecks → sidecar → espera o `/health` → janela. Mostra o progresso por etapa, nunca uma tela branca. |
| **Fechar a janela** | a casca vai para a bandeja e **o backend continua**, porque o celular depende dele para aprovar permissões (D-08) |
| **Sair (menu da bandeja)** | encerra o sidecar (SIGTERM e espera as sessões), depois `compose stop`. Os volumes ficam. |
| **Backend cai** | a casca reinicia com *backoff* e um teto, e mostra o erro com o caminho do log |
| **Docker parado** | a casca não sobe nada e diz como resolver; não tenta iniciar o daemon como root |
| **Iniciar com o sistema** | opcional, desligado por padrão (D-08) |
| **Desinstalar** | remove o app; volumes e dados ficam, e o app diz onde (S-09/S-10 do plano 19) |

## 10. Celular e exposição

Nada muda no app Flutter. O backend do desktop é alcançado pelo endereço externo que a
infraestrutura provê ([D-04/D-05 do plano 19](../plans/19-distribution/decisions.md)). O Keycloak
também precisa ser alcançável pelo celular, como já acontece no `pnpm dev:public`. O desktop só
precisa expor a configuração de URL externa na tela de ajustes, em vez de no `.env`. O padrão continua
loopback.

## 11. Tamanho, boot e build

Estimativas, para medir no spike:

| Item | Tamanho |
|---|---|
| Casca Tauri | ~10 MB |
| Node (Linux x64, descomprimido) | 123 MB **medido** |
| Binário do Claude Code do SDK | 224 MB **medido** (0 se a D-02 for "usar o `claude` instalado") |
| Backend em bundle + `node_modules` de produção | a medir |
| `web/dist` | 7,9 MB **medido** |
| Imagens Docker (Postgres + Keycloak) | 755 MB **medido**, baixadas na primeira execução ou embutidas (D-06) |

O instalador comprimido fica na faixa de **150 a 200 MB** sem as imagens. Boot a frio: o Keycloak
leva de 10 a 20 s, e o resto é rápido. A janela precisa mostrar progresso desde o primeiro segundo.

**Build**: Tauri não faz *cross-compile* confiável. São três jobs de CI (Linux, macOS, Windows), cada
um com o Node, o binário do SDK e os nativos da sua plataforma. Saídas: AppImage/.deb (Linux),
.dmg (macOS), .msi/NSIS (Windows). Assinar no macOS e no Windows exige conta e certificado, o mesmo
assunto que o plano 19 deixou fora para as lojas (D-09).

## 12. Relação com o plano 19

O plano 19 foi escrito para **instalar por terminal como serviço do SO** e diz no escopo: "Instalador
gráfico. O público desta versão usa terminal". Este documento propõe exatamente o que ele excluiu.
**Os dois não podem virar plano sem uma decisão do usuário** (D-10), pelo AGENTS.md: "conflito entre
dois documentos → pare e pergunte".

O que a discovery reaproveita ou responde do 19:

| Item do 19 | Situação com o desktop |
|---|---|
| D-01 (SO) | mantida, por decisão do usuário |
| D-02 (quem serve o web) | respondida pelo §6: o backend |
| D-03 (Postgres em Docker ou nativo) | respondida: Docker |
| D-04/D-05 (exposição, TLS) | inalteradas |
| D-08 (ripgrep) | mesma questão: o instalador leva o binário por SO |
| F1 (loopback, origem conhecida) | vale igual, porque a janela é mais uma origem conhecida |
| F2 (atualização, backup) | vira o `updater` do Tauri + backup antes da migration |
| R-02 (credencial em serviço do SO) | desaparece enquanto o app está aberto |
| `pnpm dist:verify` | troca para instalar o pacote numa VM/container limpo, abrir e fazer o smoke |

## 13. Decisões em aberto

| ID | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-01 | **Forma do "Keycloak + JRE embutidos"** | (a) imagem oficial no compose do desktop, que já traz o JRE; (b) distribuição do Keycloak + JRE (jlink) no instalador, rodando fora do Docker | **(a)**. Com Docker obrigatório pelo Postgres, (b) acrescenta ~250 MB e um processo Java para gerenciar por SO sem tirar nenhum pré-requisito. (b) só faz sentido se o Docker deixar de ser exigido. **A resposta do usuário veio antes de o Docker ser escolhido, então precisa ser confirmada.** |
| D-02 | Qual binário do Claude Code o app usa | (a) o do SDK, com versão casada; (b) o `claude` instalado na máquina | (a), com (b) como ajuste. A (a) dá previsibilidade, e o smoke-live prova a combinação. |
| D-03 | Runtime do backend | (a) binário `node` + bundle como recurso; (b) Node SEA | (a). O código é ESM e o SDK precisa do seu binário ao lado. |
| D-04 | **Como o refresh sobrevive no WebKit** (§8) | (a) HTTPS em loopback; (b) proxy na casca; (c) cookie sem `secure` em loopback; (d) Chromium em todo SO | decidir **depois** do spike S1, com o comportamento medido |
| D-05 | Store do Keycloak no desktop | (a) Postgres (modo `start`); (b) H2 do `start-dev` | (a). H2 não é suportado para dado que precisa durar. |
| D-06 | Imagens Docker | (a) baixadas na primeira execução; (b) embutidas no instalador | (a). Fixar por *digest*, não por tag. |
| D-07 | Tela de login | (a) dentro da janela; (b) navegador do sistema + loopback/esquema próprio (RFC 8252) | (a), registrada em ADR com o motivo (IdP local, mesmo fluxo do web) |
| D-08 | Fechar a janela | (a) vai para a bandeja e o backend segue; (b) encerra tudo | (a), porque o celular depende do backend vivo. "Iniciar com o sistema" fica desligado por padrão. |
| D-09 | Assinatura no macOS e no Windows | conta Apple Developer, certificado Authenticode | sem conta, o build sai sem assinatura, com o aviso do SO, e o risco é declarado (como o R-03 do 19) |
| D-10 | **Onde o desktop entra no planejamento** | (a) reescrever o plano 19 como distribuição desktop; (b) plano novo, mantendo o 19 | decisão do usuário; (a) evita dois caminhos de distribuição para manter |
| D-11 | Docker Desktop no macOS e no Windows | Docker Desktop, Podman, Colima, OrbStack | aceitar qualquer runtime que fale a API do Docker e tenha `compose`, e verificar isso na primeira execução. Ver R-03. |

## 14. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R-01 | **Cookie `secure` não gravado pelo WebKit em `http://127.0.0.1`**: o login morre no Linux e no macOS (§8) | spike S1 antes de qualquer plano; D-04 |
| R-02 | WebKitGTK diverge do Chromium que o e2e cobre: Monaco, pdf.js, xterm, `ResizeObserver`, IME | rodar o e2e do Playwright também no **projeto `webkit`** no CI do Linux. Mede isso já, mesmo sem o desktop. |
| R-03 | **Docker Desktop tem licença paga** para empresas acima de 250 pessoas ou 10 milhões de dólares de receita (macOS/Windows) | D-11: suportar Podman/Colima e dizer isso no pré-requisito |
| R-04 | Instalador grande (binário do SDK + Node por plataforma) | D-02 (b) como opção; compressão; medir no S2 |
| R-05 | Dois ambientes na mesma máquina (`pnpm dev` + app instalado) disputando porta ou volume | project name, volumes e portas próprios do desktop (§7.4) |
| R-06 | Keycloak lento no boot dá a sensação de app travado | tela de progresso por etapa; manter a pilha viva na bandeja |
| R-07 | Segredo do Keycloak (admin) e do banco em texto | cofre do SO via casca; nunca em `.env` ou em log |
| R-08 | Build de macOS e Windows sem teste automatizado (D-01 do 19) | risco aceito pelo usuário; smoke manual documentado antes de cada versão |

## 15. Matriz de cenários (semente)

Para o plano, se ele vier, enumerar por completo pelas seis dimensões do
[Estágio 0](../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
Semente:

| Dimensão | Cenários |
|---|---|
| Equivalência | primeira execução completa; abertura com a pilha já de pé; abertura com a pilha parada |
| Fronteira | porta do backend ocupada; Docker sem `compose`; disco cheio no volume; nome de usuário com acento na primeira execução |
| Erro | Docker parado; sem `~/.claude/.credentials.json`; imagem que não baixa; migration que falha; Keycloak que não fica saudável no prazo; sidecar que morre no boot |
| Transição de estado | fechar a janela → bandeja → reabrir sem novo login; sair → abrir; refresh token vence com a janela aberta (**R-01**); atualização do app com migration |
| Concorrência | duas instâncias do app (`single-instance`); app + `pnpm dev` na mesma máquina; celular aprovando enquanto a janela está fechada |
| Idempotência | `compose up` repetido; primeira execução interrompida e retomada; criação do usuário já existente |

## 16. Fatiamento sugerido

1. **S1 — spike do login no WebKit** (horas, descartável): uma casca Tauri mínima no Linux, com a
   janela apontando para `pnpm dev`. Fazer login, esperar o access token vencer e recarregar. Medir se
   o `rc_refresh` foi gravado. Isso fecha ou reabre a D-04 e responde se o Tauri continua viável sem
   mudança de autenticação.
2. **S2 — spike de empacotamento**: bundle do backend com esbuild + Node como sidecar + `web/dist`
   servido pelo backend, contra o compose de dev. Mede o tamanho real e o boot.
3. **F — backend serve o web e a configuração em tempo de execução**: útil também para o plano 19, e
   independe do Tauri.
4. **F — compose e realm de distribuição, primeira execução e segredos no cofre.**
5. **F — casca: ciclo de vida, bandeja, logs, i18n.**
6. **F — build em matriz de CI e updater.**
7. **F — E2E**: instalar o pacote numa máquina limpa (o `dist:verify` do 19), abrir, fazer login e
   rodar o smoke.

## 17. Referências

- Tauri 2 — releases: <https://tauri.app/release/tauri/all-versions/>
- Tauri — plugin shell (sidecars): <https://tauri.app/release/shell/all-versions/>
- WebKit bug 218980 (cookie `Secure` em `localhost`): <https://bugs.webkit.org/show_bug.cgi?id=218980>
- WebKit bug 231035: <https://bugs.webkit.org/show_bug.cgi?id=231035>
- WebKit bug 232088: <https://www2.webkit.org/show_bug.cgi?id=232088>
- RFC 8252 — OAuth 2.0 for Native Apps: <https://www.rfc-editor.org/rfc/rfc8252>
- [Plano 19 — Distribuição](../plans/19-distribution/README.md) e as suas [decisões](../plans/19-distribution/decisions.md)
- [Discovery 01 — Agent SDK](01-descoberta-claude-agent-sdk.md)
