# Proposta: Postura de segurança — acesso e perfis, estação de trabalho, clientes e cadeia de fornecimento

**Estado:** rascunho, sem plano. Nenhum código escrito.
**Criada em:** 2026-10-15. O usuário pediu uma discovery para "melhorar a segurança de acesso,
definição de perfis, o que pode melhorar a segurança em relação à estação de trabalho que está
rodando o backend, melhorias de segurança em front web e mobile, proteção de rotas, verificação
SAST, DAST, SBOM e dependências". Durante o levantamento, acrescentou: "rate limit, questões de
resiliência a chamada de serviços externos".
**Destino:** insumo. Pelo tamanho do escopo, **não** vira um plano só — o §15 propõe o fatiamento
em mais de um plano, com um deles sendo simplesmente *retomar* um plano que já existe e não foi
iniciado.
**Relação com outros documentos:**

- [08-authentication](../architecture/shared/08-authentication.md) e os ADRs de auth em
  [00-decisions](../architecture/shared/00-decisions.md) (ADR-010, ADR-012, ADR-021) descrevem o
  desenho pretendido; esta discovery confere o código contra ele e não encontrou divergência em
  autenticação — a lacuna está em autorização por perfil (§3) e em exposição de rede (§5).
- [Plano 19 — Distribuição](../plans/19-distribution/README.md), fase F1 (B-07…B-11), **já
  propõe** loopback por padrão, TLS obrigatório fora do loopback e recusa de configuração insegura
  no boot. Está em 0% (não iniciado). O achado mais importante desta discovery (§5) é que essa
  fase não é "nice to have": o backend hoje já liga em todas as interfaces, sem TLS, em produção.
  Esta discovery **não substitui** o plano 19 — recomenda executá-lo, sem reabrir o que ele já
  decidiu.
- [Plano 00 — Bootstrap](../plans/00-bootstrap/README.md), risco R-01 (`allow` de projeto em
  diretório confiado furando o `canUseTool`), segue listado como **aberto** no `progress.md` dele,
  mas o código já mitiga o cenário medido (§4). É uma divergência de rastreio, registrada em D-12.
- [Plano 05 — Endurecimento e operação](../plans/05-hardening-operations/README.md) — ✅ concluído.
  Cobriu limites de WebSocket, TTL de sessão, ring buffer e retry de push; **não** cobriu
  resiliência de saída para Keycloak/Postgres/Anthropic (§9), que fica para um plano novo.
  `scripts/accepted-advisories.json`, criado nesse plano, tem uma exceção (ADR-019) que **expira
  em 2026-11-02** — a poucas semanas desta discovery (D-13).
- [09-code-quality](../architecture/shared/09-code-quality.md) descreve os portões 1-11; o
  portão 10 (`pnpm scan:security`) já existe e é mais maduro do que o pedido supõe (§8) — o gap
  real não é "não ter SAST", é não ter SBOM, não ter DAST, e só rodar o portão 10 fora do push
  rápido.
- [Discovery 01](01-descoberta-claude-agent-sdk.md) e
  [04-engine-integration](../architecture/backend/04-engine-integration.md)/[04a-claude](../architecture/backend/04a-claude.md)
  descrevem a superfície de risco aceita (o Claude roda comando arbitrário na máquina do usuário,
  com as credenciais dele) e os controles que a compensam (`canUseTool`, `FolderFence`,
  allowlist de workspace). Esta discovery mede se esses controles seguem valendo (§4) — seguem.

---

## Sumário

1. [O pedido](#1-o-pedido)
2. [A resposta curta](#2-a-resposta-curta)
3. [Autenticação, perfis e proteção de rotas](#3-autenticação-perfis-e-proteção-de-rotas)
4. [Estação de trabalho e execução do agente](#4-estação-de-trabalho-e-execução-do-agente)
5. [Exposição de rede](#5-exposição-de-rede)
6. [Segurança client-side — web](#6-segurança-client-side--web)
7. [Segurança client-side — mobile](#7-segurança-client-side--mobile)
8. [SAST, DAST, SBOM e dependências](#8-sast-dast-sbom-e-dependências)
9. [Rate limit e resiliência a serviços externos](#9-rate-limit-e-resiliência-a-serviços-externos)
10. [O que já está bem resolvido](#10-o-que-já-está-bem-resolvido)
11. [Decisões em aberto](#11-decisões-em-aberto)
12. [Riscos](#12-riscos)
13. [Matriz de cenários (semente)](#13-matriz-de-cenários-semente)
14. [Fora do escopo](#14-fora-do-escopo)
15. [Fatiamento sugerido](#15-fatiamento-sugerido)
16. [Referências](#16-referências)

---

## 1. O pedido

| # | Requisito | Onde é tratado |
|---|---|---|
| R1 | segurança de acesso e definição de perfis | §3 |
| R2 | proteção de rotas | §3 |
| R3 | segurança da estação de trabalho que roda o backend | §4, §5 |
| R4 | segurança do front web | §6 |
| R5 | segurança do app mobile | §7 |
| R6 | SAST | §8 |
| R7 | DAST | §8 |
| R8 | SBOM | §8 |
| R9 | dependências | §8 |
| R10 | rate limit | §9 |
| R11 | resiliência a chamadas de serviços externos | §9 |

Medido em 2026-10-15 lendo o código (não só os documentos de arquitetura) de backend, web e
mobile, com cinco levantamentos independentes, um por área.

## 2. A resposta curta

Nenhum achado aqui é "o projeto não pensa em segurança" — o oposto: há um portão de segurança
automatizado (`pnpm scan:security`), isolamento de ambiente para o subprocesso do Claude, guard de
autenticação em toda rota, e rate limit maduro no WebSocket. Os gaps são **pontuais e
priorizáveis**, nesta ordem:

1. **O backend já liga em `0.0.0.0` (todas as interfaces), sem TLS e sem cabeçalhos de
   segurança, hoje — não é um cenário futuro.** O plano que resolve isso (19, fase F1) existe e
   está 0% feito. É o achado mais importante desta discovery (§5).
2. **Não existe rate limit em nenhuma rota HTTP** — login, criação de sessão e upload podem ser
   martelados sem limite por IP/usuário. O WebSocket, por contraste, já tem rate limit, teto de
   frame e backpressure maduros (§9).
3. **Não existe RBAC/perfil nenhum no domínio** — nem "admin", nem "suporte", nem hierarquia.
   Todo usuário tem controle total só sobre o que é seu, e nenhum poder sobre o de outro (nenhum
   IDOR horizontal encontrado). Isso pode ser a decisão certa para um produto de uso pessoal — mas
   é uma decisão que nunca foi tomada explicitamente, e o pedido do usuário por "perfis" sugere que
   vale revisitá-la (§3, D-01).
4. **O front web não tem CSP, o app mobile não tem certificate pinning, e o `Info.plist` do iOS
   não tem `CFBundleURLTypes` registrado** — o último pode ser um defeito funcional (o retorno do
   login OIDC no iOS), não só uma lacuna de segurança, e merece verificação imediata, fora do
   ritmo desta discovery (§7, D-06).
5. **SBOM e DAST não existem.** SAST (semgrep), audit de dependência (`pnpm audit` +
   `osv-scanner`) e secret scanning (gitleaks) já existem e já rodam em CI — mas só no job `full`
   (PR e noturno), nunca no push rápido, e a doc de qualidade afirma (incorretamente) que há
   Dependabot/Renovate configurado (§8).
6. **As chamadas de saída (Keycloak, Postgres) são de tentativa única, sem timeout nem retry.** O
   lado de entrada (WebSocket) é resiliente e maduro; o lado de saída não tem o mesmo tratamento,
   com a exceção do push para mobile, que já tem retry com backoff (§9).
7. **Uma exceção de segurança aceita expira em 2026-11-02** (`ADR-019`, dependência `braces` via
   `jscpd`) — a menos de um mês desta discovery. Sem renovação ou correção, o portão 10 fica
   vermelho sozinho (§8, D-13, risco já conhecido — ver [memória de sessão]).

## 3. Autenticação, perfis e proteção de rotas

Medido em `backend/src/adapter/inbound/http/**`, `backend/src/infrastructure/websocket/app.gateway.ts`,
`web/src/app/router.tsx` e `mobile/lib/app/router.dart`.

### 3.1 Validação de token — o que já está sólido

- HTTP: `@UseGuards(BearerAuthGuard)` em toda rota de produto
  ([bearer.guard.ts:29-46](../../backend/src/adapter/inbound/http/auth/bearer.guard.ts)); não há
  guard global via `APP_GUARD`, mas `callerOf()` lança `UnauthenticatedError` se alguém ler o
  usuário numa rota sem o guard — "esquecer o guard" quebra em runtime, não passa em silêncio.
  Única rota sem autenticação, de propósito: `GET /health`
  ([health.controller.ts:10-17](../../backend/src/adapter/inbound/http/health/health.controller.ts)).
  Rotas de arquivo levam guard duplo (`BearerAuthGuard` + `ApprovedDeviceGuard`).
- WebSocket: nenhum comando roda antes do handshake
  ([app.gateway.ts:243-293](../../backend/src/infrastructure/websocket/app.gateway.ts)); device
  revogado fecha o socket com `4401` no próprio handshake.
- IDOR: em todos os controllers lidos, `userId` vem só de `@CurrentUser()` (do token), nunca de
  parâmetro de rota/body. Recurso de outro usuário responde **403**, não 404 por padrão, exceto
  onde a decisão de produto é não revelar existência (ex. device de outro usuário → 404, decisão
  documentada). Não foi encontrado nenhum vetor de IDOR horizontal.
- CORS: origem única configurada, `credentials: true`
  ([bootstrap.ts:100](../../backend/src/bootstrap.ts)); CSRF não tem middleware dedicado, mas a
  superfície fica restrita a `/auth/refresh`/`/auth/logout` pelo cookie `httpOnly`+`Secure`+`SameSite=Strict`
  ([refresh-cookie.ts:15](../../backend/src/adapter/inbound/http/auth/refresh-cookie.ts)) — toda
  rota de negócio exige `Authorization: Bearer`, que um site de terceiro não forja.
- Rotas de UI: web (`FramedOutlet` envolvendo todo `<Outlet/>` autenticado,
  [FramedOutlet.tsx:17-28](../../web/src/app/FramedOutlet.tsx)) e mobile (`redirectFor` central no
  `GoRouter`, [router.dart:33-61](../../mobile/lib/app/router.dart)) não permitem que uma rota
  individual "esqueça" o guard — o gate está no nível do roteador, não da tela.

### 3.2 O que não existe: perfis/RBAC

Confirmado em três lugares independentes: `08-authentication.md` ("nenhuma role ou grupo do
provedor é lida — autorização é local"), ADR-010, e ausência total de `role`/`admin`/`rbac` com
sentido de controle de acesso em `backend/src/domain` (as únicas ocorrências de `role` são o papel
de mensagem `role: 'user'/'assistant'` do transcript, sem relação com autorização).

**O que isso significa na prática:** não há usuário com poder sobre o recurso de outro. Não há
"admin" que veja audit, devices ou regras de permissão de outra pessoa. Todo módulo —
permission-rules, audit, devices, agent-settings — é self-service: o dono do recurso é o único
autorizado a vê-lo ou mudá-lo. Isso é seguro (não há escalonamento horizontal nem vertical porque
não há hierarquia nenhuma), mas é uma decisão de produto implícita, nunca registrada como ADR. O
pedido original do usuário por "definição de perfis" não tem correspondente hoje — ver D-01.

## 4. Estação de trabalho e execução do agente

Medido em `backend/src/adapter/outbound/engines/claude/**`,
`backend/src/adapter/outbound/filesystem/folder-fence.ts` e `docs/architecture/backend/04a-claude.md`.

### 4.1 O que já está sólido

- Toda chamada de `query()` passa por `assertSafeSdkOptions`
  ([query.factory.ts:63-76](../../backend/src/adapter/outbound/engines/claude/query.factory.ts)),
  que recusa a sessão se `settingSources` não for exatamente `['project']`, se não houver hook
  `PreToolUse` real, se `canUseTool` não for função, se alguma variável de ambiente do backend
  (`RC_`, `OIDC_`, `DATABASE_`, `PG`, `NODE_ENV`, `LOG_LEVEL`) vazar para o subprocesso do Claude,
  ou se MCP/configuração de projeto estiver fora do allowlist. Há um segundo portão no boot
  (`security-contract.ts`) que prova essa recusa antes do motor ficar disponível.
- O risco conhecido de diretório "confiado" furando o `canUseTool`
  ([04a-claude.md:155-179](../architecture/backend/04a-claude.md)) **já está mitigado**:
  `clearTrustMark()` roda antes de toda sessão, inclusive as efêmeras
  ([trusted-directory.ts:49-78](../../backend/src/adapter/outbound/engines/claude/trusted-directory.ts)).
- Workspace: allowlist fora do repo (`infra/workspace-allowlist.yaml`), `WorkspacePath.create()`
  recusando path relativo/`\0`, e `FolderFence` resolvendo `realpath` e **reverificando no
  descriptor aberto** (`/proc/self/fd/<fd>`, `O_NOFOLLOW`) contra troca de symlink entre o check e
  o `open` (TOCTOU) — mas esse recheck é **Linux-only**; onde não há `/proc`, o passo é pulado
  (gap já assumido em código, atribuído ao plano 19 · R-02, ainda não fechado).
- Segredos: nenhum `.env` real nem segredo commitado encontrado; a credencial da Anthropic não
  é gerida pelo produto (vem de `~/.claude/.credentials.json` do SO); a credencial de push é
  arquivo com `chmod 600`, nunca env var; o ambiente passado ao subprocesso do Claude é filtrado
  por deny-list de prefixo, então `Bash` do Claude não enxerga `DATABASE_URL` nem a senha do
  Keycloak via `env`.

### 4.2 O que é risco aceito, documentado, sem controle de SO

- Nenhuma trava contra o backend rodar como root, e nenhum isolamento de processo (sandbox,
  cgroup, namespace, usuário dedicado) imposto pelo próprio backend para o subprocesso do Claude.
  O controle inteiro é por aplicação (`canUseTool`, allowlist de workspace, auditoria), não por
  isolamento de sistema operacional. Isso **já é uma decisão consciente e documentada** em
  `04a-claude.md`/`00-decisions.md`/`19-distribution` ("quem alcança o backend executa comando
  arbitrário na máquina, com as credenciais do usuário") — não é um achado novo, mas vale
  reafirmar como decisão explícita nesta discovery, porque o pedido do usuário foi por "segurança
  da estação de trabalho" (D-02 trata da parte de rede; esta parte do risco fica registrada, sem
  mudança recomendada, em D-14).
- Divergência de rastreio: o R-01 do plano `00-bootstrap` segue "🔲 aberto" no progresso, embora o
  código (§4.1) já meça e mitigue o cenário. Fechar isso é só atualizar o documento (D-12).

## 5. Exposição de rede

**O achado mais importante desta discovery.** O backend liga em `0.0.0.0` — todas as interfaces —
por decisão já tomada em código, com o comentário explicando o motivo (o celular que aprova
permissão não está na mesma máquina):
[bootstrap.ts:107,112-115](../../backend/src/bootstrap.ts). `configureApp()`
([bootstrap.ts:80-104](../../backend/src/bootstrap.ts)) só tem `cookieParser` e `enableCors` — sem
`helmet`, sem cabeçalho de segurança padrão em toda resposta (só dois `Content-Security-Policy:
sandbox` pontuais em rotas de download de arquivo). Não há checagem de TLS nem recusa de subida
por configuração insegura.

Isso **não é uma lacuna não planejada** — é exatamente o que o
[plano 19 — Distribuição](../plans/19-distribution/README.md), fase F1, já prevê corrigir:

| Task | O que entrega | Estado |
|---|---|---|
| B-07 | loopback por padrão | 🔲 não iniciada |
| B-08 | TLS obrigatório fora do loopback | 🔲 não iniciada |
| B-09 | origem conhecida, na API e no handshake do WS | 🔲 não iniciada |
| B-11 | configuração insegura impede a subida | 🔲 não iniciada |

O plano inteiro está em 0% (nenhuma fase iniciada,
[progress.md](../plans/19-distribution/progress.md)). O acesso remoto hoje depende de o operador
configurar um túnel/proxy por fora (`pnpm dev:public`, ngrok) — um fluxo de desenvolvimento, não a
solução de distribuição definitiva. **Recomendação desta discovery: não reabrir o desenho do plano
19, só executá-lo — é a ação de maior impacto por esforço de toda esta lista** (D-02).

## 6. Segurança client-side — web

Medido em `web/src`. Confirma o desenho de `08-authentication.md` sem desvio: access token nunca
toca `localStorage`/`sessionStorage` (fica em memória no store Zustand,
[auth.store.ts:8-22](../../web/src/features/auth/store/auth.store.ts)); refresh token só em
cookie `httpOnly`+`Secure`+`SameSite=Strict`; token do WebSocket vai no primeiro frame
(`connection.authenticate`), nunca na query string.

**O que falta:**

- **Sem CSP real** — nem meta tag em `web/index.html`, nem header, nem configuração em
  `vite.config.ts`. A única defesa contra XSS hoje é estrutural: `Markdown.tsx` usa
  `react-markdown` com `skipHtml` e sem `rehype-raw` (HTML cru nunca vira DOM — zero ocorrências de
  `dangerouslySetInnerHTML` em `web/src`), `safe-url.ts` bloqueia esquema `javascript:`/`data:`/
  `vbscript:`/`file:`, e o único SVG gerado a partir de texto (diagramas Mermaid) passa por
  `DOMPurify.sanitize`. É uma defesa sólida, mas sem CSP como segunda camada, uma dependência nova
  que introduzisse HTML cru (ou um bug na sanitização do Mermaid) não teria uma rede de segurança
  no nível do navegador.
- Nenhuma dependência de parsing/markdown no lockfile chamou atenção por estar visivelmente
  desatualizada (checagem visual, não substitui rodar o scanner do §8 regularmente).

## 7. Segurança client-side — mobile

Medido em `mobile/lib` e nos manifests de Android/iOS. Confirma `08-authentication.md`: credencial
só em `flutter_secure_storage` (Keychain/EncryptedSharedPreferences), nunca em `SharedPreferences`
nem `Hive`; access token em memória para a camada de rede; token do WebSocket no primeiro frame.
Nenhuma renderização de HTML cru (markdown vira widget nativo via `flutter_markdown_plus`, não
`innerHTML`).

**O que falta ou precisa verificação:**

- **Sem certificate pinning** — `Dio` configurado sem `HttpClientAdapter` customizado, sem
  `badCertificateCallback`, sem `SecurityContext`. TLS é só o padrão da plataforma.
- **`Info.plist` do iOS não tem `CFBundleURLTypes`/`CFBundleURLSchemes` registrado no repositório**
  — o Android tem o `intent-filter` do redirect OIDC gerado via `manifestPlaceholders` no
  `build.gradle.kts`; o iOS, não. Isso **pode ser um defeito funcional real** (o retorno do
  `ASWebAuthenticationSession` depende desse registro), não só uma lacuna de segurança — merece
  confirmação com quem fez o último build iOS antes de tratar como item de backlog (D-06,
  prioridade separada das demais).

## 8. SAST, DAST, SBOM e dependências

O portão 10 (`pnpm scan:security`,
[scan-security.mjs](../../scripts/scan-security.mjs)) já é mais maduro do que o pedido original
supõe: roda, em sequência, `gitleaks` (secrets), `pnpm audit --audit-level high`, `osv-scanner`
(qualquer severidade, os dois lockfiles), regras próprias de Agent SDK e de nome de fornecedor, e
`semgrep` (`p/typescript`, `p/nodejs`, `p/command-injection`, `p/jwt`, imagem fixada
`semgrep/semgrep:1.86.0`). Isso é o SAST e parte do pedido de "dependências" já resolvidos.

**O que falta:**

- **SBOM:** não existe — nenhuma menção a CycloneDX/SPDX em `scripts/`, `docs/` ou qualquer
  `package.json`.
- **DAST:** não existe — nenhum OWASP ZAP nem teste de segurança dinâmica contra a aplicação
  rodando.
- **Cadência:** o gate 10 roda só no job `full` do CI (`.github/workflows/ci.yml`, em PR e no cron
  noturno `0 3 * * *`), **nunca** no job `fast` de todo push. Uma vulnerabilidade nova de
  dependência só aparece em PR ou de madrugada, não no push imediato.
- **Plataforma:** nenhuma ferramenta de plataforma (GitHub Advanced Security, Snyk, CodeQL, Trivy)
  — a composição é inteiramente caseira, com ferramentas de terceiro orquestradas por script
  próprio.
- **Divergência de documentação:** `09-code-quality.md` (linha 312) afirma que "atualização de
  dependência é automatizada (Renovate/Dependabot)" — **não há configuração real de nenhum dos
  dois** no repositório (nem `.github/dependabot.yml`, nem `renovate.json`). É aspiração não
  implementada (D-10).
- **Exceção com prazo:** `scripts/accepted-advisories.json` tem uma única exceção ativa —
  `GHSA-vfj7-8cjw-p6xm` em `braces@3.0.3` (via `jscpd`), sob ADR-019, **válida até 2026-11-02**.
  Faltam ~18 dias desta discovery até a expiração (D-13, urgente).
- O skill `security-review` do Claude Code nunca foi efetivamente invocado neste projeto — a única
  revisão de segurança mencionada em qualquer plano é manual, planejada no fim do plano 27, e ainda
  pendente.
- Flutter: `analysis_options.yaml` é rigoroso em arquitetura/complexidade, mas não tem nenhuma
  regra de segurança dedicada; a cobertura de dependência vulnerável do mobile vem só do
  `osv-scanner` sobre `pubspec.lock`, dentro do mesmo gate 10.
- ESLint: nenhum `eslint-plugin-security` nem `eslint-plugin-no-secrets` configurado — a única
  regra de segurança via lint é customizada (`no-restricted-syntax` proibindo `localStorage` para
  token no web).

## 9. Rate limit e resiliência a serviços externos

### 9.1 Entrada — já maduro

O WebSocket tem rate limit real por conexão (token bucket,
[frame-rate-limiter.ts:14-60](../../backend/src/infrastructure/websocket/frame-rate-limiter.ts),
`RATE_LIMITED` e depois `4429`), teto de sessões anexadas, teto de tamanho de frame, backpressure
com desconexão deliberada (`1013`) em vez de acumular memória sem limite
([06-realtime.md:38-114](../architecture/backend/06-realtime.md)), heartbeat (30s/10s → `4408`),
TTL de sessão ociosa (30 min, `SessionReaperJob`), e grace de reautenticação (60s antes de fechar
com `4401`). Idempotência: `requestId` dedupe em permissão, `seq` monotônico no protocolo, e resume
de sessão concorrente convergindo para uma única `query()`.

### 9.2 Entrada HTTP — não existe

**Nenhuma rota HTTP tem rate limit** — nem `@nestjs/throttler`, nem `express-rate-limit`, nem
guard customizado. Login, criação de sessão e upload podem ser martelados sem limite por
IP/usuário/dispositivo. Os únicos "429" hoje vêm de limite de **capacidade** (sessões simultâneas,
pastas abertas), não de limite de taxa.

### 9.3 Saída — tentativa única, sem timeout nem retry

- Keycloak: discovery e JWKS são cacheados (1h e com cooldown), com fallback *stale-if-error* no
  discovery — mas as chamadas `fetch` em si (`oidc-discovery.ts`, `jwks-cache.ts`,
  `oidc-identity-provider.adapter.ts`) não têm `AbortController`/timeout nem retry com backoff.
  Uma troca de código ou refresh de token lento/pendurado fica sujeito só ao timeout do socket TCP
  do runtime.
- Postgres: pool configurado com `max: 10`, `statement_timeout: 10s`, `idleTimeoutMillis: 10s`
  ([connection.ts:26-36](../../backend/src/infrastructure/database/connection.ts)) — mas um erro
  de conexão (`ECONNREFUSED`) não é mapeado para um `DomainError`/503 específico, caindo no branch
  genérico do filtro de exceção como 500. Sem retry de query.
- Agent SDK/Anthropic: falha de `query()` já é mapeada para erro de domínio
  (`AgentUnavailableError`→502, `AgentTimeoutError`→504); retry/backoff para a própria API da
  Anthropic é feito pelo SDK/CLI, não por uma camada nossa — não há circuit breaker do backend
  sobre isso.
- A única exceção com retry/backoff **com decisão própria** é o push para mobile (3 tentativas,
  1s→4s com jitter, D-09 do plano 05) — mostra que o padrão existe no projeto, só não foi
  generalizado.
- Nenhuma ADR em `00-decisions.md` discute diretamente o que fazer se Keycloak, Postgres ou a API
  da Anthropic ficarem indisponíveis, como decisão de produto (o que existe é tático e pontual).
- Timeout de requisição HTTP: existe limite de **tamanho** de upload, mas não há
  `server.setTimeout`/`headersTimeout`/`keepAliveTimeout` configurado — um upload deliberadamente
  lento pode manter a conexão aberta pelos defaults do runtime.

## 10. O que já está bem resolvido

Para não perder de vista em meio aos gaps — isto **não precisa de plano novo**:

- Autenticação (token nunca em storage client-side inseguro, WS autenticado por frame) e proteção
  de rotas de UI nas três pontas.
- IDOR: nenhum vetor encontrado; toda autorização é por `userId` do token, nunca por parâmetro.
- Isolamento do subprocesso do Claude: `settingSources`, `PreToolUse`, ambiente filtrado,
  `FolderFence` com defesa TOCTOU (exceto fora do Linux).
- Rate limit, backpressure, heartbeat e TTL do WebSocket.
- SAST (semgrep), audit de dependência (`pnpm audit` + `osv-scanner`) e secret scanning
  (gitleaks) já existem e rodam em CI.
- Sanitização estrutural de conteúdo do agente nas duas pontas (nunca HTML cru).

## 11. Decisões em aberto

| ID | Decisão | Recomendação |
|---|---|---|
| D-01 | O produto quer introduzir perfis/hierarquia de privilégio (admin, suporte) ou mantém "cada usuário só sobre o que é seu"? Hoje não existe nenhuma role | depende do modelo de uso pretendido (pessoal de um usuário só vs. compartilhado/equipe). Sem essa resposta, não dá para fatiar um plano de RBAC — é a primeira pergunta a responder |
| D-02 | Prioridade de execução: retomar o plano 19 (exposição de rede) antes de qualquer item novo desta lista? | **sim** — é o único achado que já está em produção como lacuna (bind `0.0.0.0` sem TLS), e o plano que resolve já existe, só falta rodar |
| D-03 | Adicionar rate limit HTTP (login, criação de sessão, upload) — biblioteca e limites | `@nestjs/throttler`, por IP e por usuário autenticado; medir o volume real de login/sessão antes de fixar o número |
| D-04 | CSP real no web — nível de rigidez dado que o app usa libs de terceiro (Mermaid, etc.) | CSP com nonce por request para script, `default-src 'self'`, revisar caso a caso o que o Mermaid/Markdown precisam carregar |
| D-05 | Certificate pinning no mobile — vale o custo operacional (rotação de pin quando o próprio usuário troca o certificado do backend self-hosted)? | avaliar custo-benefício dado que o backend é operado pelo próprio usuário, não um serviço de terceiro fixo; pinning pode gerar mais lockout do que proteção aqui |
| D-06 | `CFBundleURLTypes` ausente no `Info.plist` do iOS — confirmar se é lacuna de repo ou se o build real injeta isso | **verificar com urgência, fora do ritmo desta discovery** — se for lacuna real, o login OIDC no iOS pode já estar quebrado ou dependente de configuração não versionada |
| D-07 | Adotar SBOM — formato e ferramenta | CycloneDX via `cdxgen` ou `syft`, gerado no release, não necessariamente como gate que quebra build |
| D-08 | Adotar DAST — contra o quê, quando | OWASP ZAP baseline contra backend+web rodando localmente (o produto é local, não um SaaS público), rodando no mesmo ritmo do gate 10 |
| D-09 | Mover o gate 10 (`scan:security`) para rodar também no job `fast` (todo push), não só em PR/noturno | medir o custo de tempo antes; se inviável, pelo menos o secret-scan (`gitleaks --staged`, já existe) continua barato o bastante para todo push |
| D-10 | `09-code-quality.md` afirma Dependabot/Renovate configurado — corrigir a doc ou implementar de fato | implementar Renovate (ou Dependabot) de verdade, já que o texto já promete isso há tempo |
| D-11 | Timeout/retry/circuit breaker para chamadas de saída (Keycloak, Postgres) | adicionar timeout explícito em toda chamada `fetch` de `identity/`, e decidir uma política comum (quantas tentativas, que erro vira o quê) antes de implementar caso a caso |
| D-12 | Fechar o R-01 do plano `00-bootstrap` (divergência de rastreio: já mitigado, ainda marcado aberto) | atualizar `progress.md`/`README.md` do plano 00 apontando para `trusted-directory.ts`/`security-contract.ts` como a mitigação |
| D-13 | ADR-019 (`braces@3.0.3` via `jscpd`) expira 2026-11-02 | renovar a análise de risco ou migrar `jscpd` para uma versão sem o advisory antes da data; não é uma decisão desta discovery, é um prazo que já existe |
| D-14 | Reafirmar como decisão explícita (não um achado novo): sem isolamento de SO para o subprocesso do Claude, o controle inteiro é por aplicação | manter como está — é a base do produto (Claude roda com os privilégios do usuário dono da máquina); só revisar se o produto algum dia rodar como serviço multiusuário na mesma máquina |

## 12. Riscos

| ID | Risco | Mitigação |
|---|---|---|
| R-01 | Backend exposto diretamente à internet em `0.0.0.0` sem TLS, por erro de operador, antes do plano 19 fechar B-07/B-08/B-11 | executar o plano 19 antes de qualquer feature nova que aumente a superfície de rede (D-02) |
| R-02 | Brute-force de login ou flood de criação de sessão/upload, sem rate limit HTTP | D-03 |
| R-03 | Dependência nova introduz HTML cru (ou a sanitização do Mermaid tem um bug) sem CSP como segunda camada no web | D-04 |
| R-04 | ADR-019 expira sem renovação e o gate 10 fica vermelho sozinho, bloqueando todo PR | D-13, com prazo definido |
| R-05 | Chamada de saída sem timeout (Keycloak) trava uma promise/handle indefinidamente sob degradação do provedor | D-11 |
| R-06 | Defesa TOCTOU do `FolderFence` é pulada fora do Linux, se o backend algum dia rodar em macOS/Windows em produção | já registrado como plano 19 · R-02 (parcial — R-02 de lá trata só da credencial, não deste gap; vale registrar lá também) |
| R-07 | `Info.plist` do iOS sem `CFBundleURLTypes` pode já ser um login quebrado em produção, não só uma lacuna de segurança | D-06, verificação imediata |

## 13. Matriz de cenários (semente)

Para o(s) plano(s) que saírem daqui enumerarem por inteiro, pelas seis dimensões do
[protocolo §Estágio 0](../architecture/shared/11-validation-protocol.md).

| Dimensão | Cenários |
|---|---|
| Equivalência | login dentro do limite de rate; backend subindo em loopback por padrão; SBOM gerado com todas as dependências de um build limpo; chamada ao Keycloak respondendo dentro do timeout |
| Fronteira | N-ésima tentativa de login no limite exato do rate limit; token expirando no instante exato de uma chamada ao Keycloak; upload no tamanho máximo permitido sem timeout de requisição |
| Erro | login martelado sem rate limit (hoje); Keycloak fora do ar durante refresh de token; Postgres caindo no meio de uma query; subida do backend com TLS ausente fora do loopback (deve recusar, pós-D-02); CSP bloqueando um script legítimo mal configurado |
| Transição de estado | device revogado com socket aberto; credencial expirando com grace de reautenticação; sessão WS reconectando depois de um `1013` por backpressure |
| Concorrência | duas tentativas de login simultâneas sob rate limit; dois refreshes de token concorrentes para o mesmo usuário; dois pedidos de permissão com o mesmo `requestId` |
| Idempotência | retry de uma chamada ao Keycloak não duplica efeito; `requestId` de permissão repetido vira no-op (já coberto hoje); SBOM gerado duas vezes para o mesmo commit é idêntico |

## 14. Fora do escopo

- Qualquer mudança no modelo de autenticação em si (OIDC, Keycloak próprio) — já decidido em
  ADR-010 e funcionando; esta discovery não encontrou desvio.
- Isolamento de sistema operacional (sandbox, cgroup, container) para o subprocesso do Claude — é
  a base do produto, registrada como decisão aceita (D-14), não um gap a fechar.
- O desenho do plano 19 — esta discovery recomenda executá-lo, não reabri-lo.
- Auditoria de todas as dependências uma por uma (CVE a CVE) — isso é o que o gate 10 já faz de
  forma contínua; o gap medido é de cadência e cobertura de ferramenta (SBOM, DAST), não de
  existência do processo.

## 15. Fatiamento sugerido

Dado o tamanho, a recomendação é **não** criar um plano monolítico. Em vez disso:

| Ordem | Entrega | Depende de | Observação |
|---|---|---|---|
| 1 | **Retomar o plano 19** (loopback, TLS, origem, recusa de config insegura) | nada — já existe, 0% feito | maior impacto por esforço; nenhuma decisão nova necessária, só execução |
| 2 | **Plano novo — acesso e perfis**: D-01 respondida primeiro; se "sim", RBAC mínimo (quem pode ver o quê); se "não", registrar a decisão como ADR | D-01 | só nasce depois da resposta do usuário sobre o modelo de uso |
| 3 | **Plano novo — hardening client-side**: CSP no web (D-04), decisão de pinning no mobile (D-05), e a verificação urgente do `Info.plist` iOS (D-06) sai **antes**, como correção pontual, não como parte do plano | D-04, D-05; D-06 corre em paralelo, fora do plano | |
| 4 | **Plano novo — rate limit e resiliência de saída**: throttler HTTP (D-03), timeout/retry/circuit breaker para Keycloak/Postgres (D-11) | D-03, D-11 | fecha o lado de saída que o plano 05 (✅ concluído) não cobriu |
| 5 | **Plano novo — cadeia de fornecimento**: SBOM (D-07), DAST (D-08), mover/ajustar cadência do gate 10 (D-09), Dependabot/Renovate real (D-10) | D-07…D-10 | pode ser o de menor urgência dos quatro, mas D-13 (ADR-019 expirando 2026-11-02) precisa de ação antes, independente da ordem dos planos |
| — | **Correções de rastreio, sem plano**: fechar o R-01 do plano 00 (D-12), renovar/resolver ADR-019 (D-13) | nenhuma | são edições de documento/dependência, não merecem fase própria |

## 16. Referências

**Backend — auth e rotas:**
[bearer.guard.ts](../../backend/src/adapter/inbound/http/auth/bearer.guard.ts) ·
[health.controller.ts](../../backend/src/adapter/inbound/http/health/health.controller.ts) ·
[app.gateway.ts](../../backend/src/infrastructure/websocket/app.gateway.ts) ·
[refresh-cookie.ts](../../backend/src/adapter/inbound/http/auth/refresh-cookie.ts) ·
[bootstrap.ts](../../backend/src/bootstrap.ts) ·
[devices.controller.ts](../../backend/src/adapter/inbound/http/devices/devices.controller.ts) ·
[approved-device.guard.ts](../../backend/src/adapter/inbound/http/files/approved-device.guard.ts) ·
[authorize-folder-read.use-case.ts](../../backend/src/application/auth/authorize-folder-read.use-case.ts).

**Estação de trabalho:**
[query.factory.ts](../../backend/src/adapter/outbound/engines/claude/query.factory.ts) ·
[trusted-directory.ts](../../backend/src/adapter/outbound/engines/claude/trusted-directory.ts) ·
[folder-fence.ts](../../backend/src/adapter/outbound/filesystem/folder-fence.ts) ·
[host-environment.ts](../../backend/src/shared/process/host-environment.ts) (neutro desde o plano 13 · B-20) ·
[04a-claude.md](../architecture/backend/04a-claude.md).

**Rede e operação:**
[06-realtime.md](../architecture/backend/06-realtime.md) ·
[frame-rate-limiter.ts](../../backend/src/infrastructure/websocket/frame-rate-limiter.ts) ·
[connection.ts](../../backend/src/infrastructure/database/connection.ts) ·
[plano 19 F1](../plans/19-distribution/F1-exposure.md).

**Web:** [auth.store.ts](../../web/src/features/auth/store/auth.store.ts) ·
[Markdown.tsx](../../web/src/shared/components/markdown/Markdown.tsx) ·
[safe-url.ts](../../web/src/shared/components/markdown/safe-url.ts) ·
[mermaid-engine.ts](../../web/src/shared/components/markdown/mermaid-engine.ts).

**Mobile:** [credential_store.dart](../../mobile/lib/core/storage/credential_store.dart) ·
[api_client.dart](../../mobile/lib/core/network/api_client.dart) ·
[oidc_auth_data_source.dart](../../mobile/lib/features/auth/data/datasources/oidc_auth_data_source.dart) ·
`mobile/ios/Runner/Info.plist` · `mobile/android/app/build.gradle.kts`.

**Qualidade e dependências:**
[scan-security.mjs](../../scripts/scan-security.mjs) ·
[accepted-advisories.json](../../scripts/accepted-advisories.json) ·
[09-code-quality.md](../architecture/shared/09-code-quality.md) ·
[.github/workflows/ci.yml](../../.github/workflows/ci.yml).

**Planos:** [00-bootstrap · R-01](../plans/00-bootstrap/README.md) ·
[05-hardening-operations](../plans/05-hardening-operations/README.md) (✅ concluído) ·
[19-distribution](../plans/19-distribution/README.md).
