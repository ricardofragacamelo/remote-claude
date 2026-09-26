# Autenticação — OpenID Connect

**OIDC, agnóstico de provedor. Auth0 é o alvo inicial, não a dependência.**

Atravessa as três pontas: web e mobile fazem o login, o backend valida o token. Por isso
está aqui, e não em uma pasta de ponta.

Voltar para o [índice transversal](README.md).

---

## As duas regras

1. **Nenhum código conhece "Auth0".** O que o código conhece é OIDC: `issuer`, `authorization_endpoint`,
   `jwks_uri`, `client_id`. Trocar de provedor é trocar configuração.
2. **O backend nunca vê senha, e nunca emite token de identidade.** Ele apenas **valida** o
   que o provedor emitiu. Não existe tabela de senha neste sistema.

O único ponto do código onde o nome do provedor pode aparecer é um comentário explicando uma
peculiaridade dele — e mesmo isso é sinal de alerta.

---

## Por que OIDC aqui

Este backend dá acesso a **execução de comando arbitrário na máquina do usuário**. Autenticar
bem não é requisito de conformidade, é o que impede alguém de ter shell na sua máquina.

Delegar para um provedor OIDC entrega, sem escrevermos nada: MFA, rotação de credencial,
detecção de credencial vazada, revogação central, e trilha de login. Reimplementar isso seria
errado — e implementar mal, perigoso.

Ver [ADR-010](00-decisions.md#adr-010--openid-connect-agnóstico-de-provedor-auth0-como-alvo-inicial).

---

## Fluxo por cliente

| Cliente | Fluxo | Por quê |
|---|---|---|
| Web | **Authorization Code + PKCE** | SPA é cliente público — não guarda segredo |
| Mobile | **Authorization Code + PKCE** em aba externa do sistema | WebView é anti-padrão: não compartilha sessão do SO e permite ao app ler a credencial |
| Backend | nenhum — **valida** o token recebido | é Resource Server, não cliente |

**Implicit flow é proibido.** Foi depreciado e expõe token na URL.

### Web

```
1. usuário clica em entrar
2. gera code_verifier + code_challenge (S256) e state
3. redireciona para o authorization_endpoint (descoberto, não hardcoded)
4. provedor autentica e volta para /callback com code
5. troca code por tokens no token_endpoint
6. guarda: access token em memória; refresh token em cookie httpOnly+Secure+SameSite
```

**Token nunca em `localStorage`.** `localStorage` é legível por qualquer script — um XSS
vira roubo de sessão permanente. Access token vive em memória (morre com a aba) e é
renovado por refresh token em cookie que o JS não alcança.

### Mobile

- Aba externa do sistema (`ASWebAuthenticationSession` no iOS, Custom Tabs no Android).
  **Nunca WebView embutida.**
- Retorno por deep link com esquema registrado do app.
- `code_verifier` e refresh token em armazenamento seguro do SO (Keychain / Keystore),
  **nunca** em `SharedPreferences` ou arquivo.
- Ver [mobile/07-auth.md](../mobile/07-auth.md).

---

## Validação no backend

Toda requisição HTTP e todo handshake WS validam o access token, **na ordem**:

1. Assinatura, contra a JWKS do `issuer` — chaves buscadas do `jwks_uri` e **cacheadas com
   rotação** (o provedor gira chave sem avisar; recarregue ao ver `kid` desconhecido).
2. `iss` bate com o issuer configurado.
3. `aud` contém o identificador desta API.
4. `exp` e `nbf`, com tolerância de relógio de no máximo 60 s.
5. Algoritmo está na allowlist (`RS256` / `ES256`). **Nunca aceite `alg` do token**, e
   **nunca** `none` — aceitar o que o token declara é a vulnerabilidade clássica de JWT.
6. Escopos/claims necessários estão presentes.

Falha em qualquer passo → `401 UNAUTHENTICATED`. Não diga **qual** passo falhou na resposta;
diga no log.

O backend **não** faz introspecção remota a cada request — valida a assinatura localmente.
Introspecção síncrona colocaria o provedor no caminho crítico de cada chamada.

### Discovery

A configuração é descoberta em `${issuer}/.well-known/openid-configuration`, não escrita à
mão. Endpoints são cacheados e revalidados periodicamente. Isso é o que torna a troca de
provedor uma mudança de variável de ambiente.

---

## Identidade e o modelo local

O provedor é dono da **autenticação**; nós somos donos da **autorização** e do
**perfil local**.

```
sub (claim do provedor)  ─────►  User.externalId   (chave estável, imutável)
                                 User.id           (nosso UUID)
```

- **`sub` é a chave**, nunca o e-mail. E-mail muda, e em alguns provedores pode ser reusado.
- No primeiro login, o usuário é provisionado localmente (just-in-time) a partir das claims.
- `email_verified: false` **não** entra. E-mail não verificado é vetor de tomada de conta.
- Autorização (quem pode abrir qual workspace, quem pode aprovar permissão) é **nossa**, na
  tabela local. Não dependa de role vinda do provedor — isso acopla o modelo de acesso ao
  fornecedor.

**O sistema é multiusuário desde a primeira migration**, mesmo instalado numa máquina pessoal.
`userId` é `NOT NULL` em workspace, audit e permission, e **toda** query é escopada. Não é
antecipação de um requisito futuro: trilha de auditoria é append-only, e retrofitar escopo nela
seria migração de dados numa tabela que o desenho proíbe reescrever. Daí decorrem três regras que
aparecem em cada módulo:

- a **raiz de workspace** declara quem a usa, e raiz de outro responde 404;
- a **regra de permissão** é sempre de **um** usuário, nunca da máquina — `always` significa "em
  qualquer projeto **deste** usuário";
- a **trilha** é lida só pelo dono, e a de outro responde 404.

---

## Device e o canal mobile

Autenticar o usuário não basta para aprovar execução de comando. Um **device** precisa de
registro explícito antes do primeiro uso:

```
login OIDC bem-sucedido
   → app registra o device (installId, nome, plataforma, push token, locale)
   → device entra como "pendente"
   → aprovação a partir de uma sessão já confiável (web)
   → só então pode responder permission requests
```

Motivo: o token OIDC prova *quem* é. O registro de device prova *de onde*. Como a decisão
autorizada executa comando na máquina, as duas coisas são necessárias.

**A identidade do aparelho é o `installId`**, gerado pelo app na primeira execução e guardado no
armazenamento seguro — não um identificador do SO. O identificador do SO é estável demais numa
direção: persiste depois de desinstalar, o que é questão de privacidade. O `installId` some com o
app, e a reinstalação aparece como aparelho novo, com o antigo visível na lista para ser
revogado.

**A unicidade é o par `(userId, installId)`**, não o `installId` sozinho. Com multiusuário, o
registro do usuário B no mesmo celular sobrescreveria a linha já aprovada do usuário A —
aprovação herdada em silêncio, que é o oposto do que o registro existe para garantir.

**Aprovar device é só pelo web.** Se um aparelho aprovado pudesse aprovar outro, um celular
comprometido aprovaria o próximo. O preço está dito: o primeiro aparelho depende de um navegador.
Reabrir isso é **ADR**, não decisão de plano.

**O pendente expira em 7 dias** e sai da lista; registrar de novo é abrir o app. Lista longa de
pendentes é como se aprova por cansaço o aparelho errado, meses depois. Não há teto de aparelhos
por usuário — o número não é o problema, a idade é.

**Revogar um device faz a credencial dele parar de valer aqui, na hora** — as connections abertas
fecham com `4401`, um novo handshake daquele `installId` é recusado, e toda ação que decide
responde `DEVICE_REVOKED`. É registrado em `audit`.

O que a revogação **não** faz, e precisa estar dito: encerrar a sessão do usuário no provedor. O
backend é Resource Server e nunca vê o refresh token do app — quem renova é o próprio app, direto
contra o provedor —, então não há o que revogar lá sem guardar credencial, o que é proibido. O
access token daquele aparelho continua válido **para o provedor** até expirar; ele não abre nada
aqui, que é o que importa. Encerrar no provedor é o logout
([02 · D-18](../../plans/02-mobile-approval/decisions.md#d-18--o-que-a-revogação-consegue-prometer)).

---

## Token no WebSocket

O handshake manda o access token no comando `connection.authenticate` — **não** em query
string (query string vaza em log de proxy e histórico).

Ver [05-websocket-protocol.md](05-websocket-protocol.md#handshake).

Dois pontos que só existem por causa do WS:

1. **O token expira com o socket aberto.** A conexão **não** é derrubada na hora: o cliente
   renova e envia `connection.reauthenticate` com o token novo. Falhou em renovar até o fim
   do período de graça (60 s) → fecha com `4401`.
2. **Revogação precisa alcançar socket aberto.** Revogar device ou usuário fecha as
   connections dele na hora. Sem isso, um device revogado continuaria aprovando permissão
   até o token expirar.

---

## Renovação e expiração

| Token | Vida | Onde mora |
|---|---|---|
| Access | 15 min | memória (web) · Keychain/Keystore (mobile) |
| Refresh | dias, **com rotação** | cookie httpOnly (web) · armazenamento seguro do SO (mobile) |
| ID | só no login, para ler claims | não é enviado ao backend como credencial |

- **Rotação de refresh token obrigatória**, com detecção de reuso: refresh usado duas vezes
  significa credencial vazada → revoga a família inteira de tokens.
- ID token **não** autentica chamada de API. Ele descreve o login; o access token autoriza.
  Confundir os dois é erro comum e perigoso.
- Renovação é **proativa** (antes de expirar), não reativa depois de um `401` — senão toda
  expiração vira uma falha visível na tela.

---

## Configuração

```bash
OIDC_ISSUER=https://<tenant>.auth0.com/    # trocar isto troca de provedor
OIDC_AUDIENCE=https://api.remote-claude.local
OIDC_CLIENT_ID_WEB=…
OIDC_CLIENT_ID_MOBILE=…
OIDC_SCOPES="openid profile email offline_access"
```

Validado no boot com schema. Faltando ou inválido, **o processo não sobe** — backend no ar
sem autenticação configurada é pior que backend fora do ar.

Nenhuma URL de endpoint em variável: vem do discovery.

---

## Erros

| `code` | HTTP | Quando |
|---|---|---|
| `UNAUTHENTICATED` | 401 | sem token, inválido, assinatura ruim, `aud`/`iss` errado |
| `TOKEN_EXPIRED` | 401 | expirado — cliente deve renovar e repetir |
| `DEVICE_NOT_REGISTERED` | 403 | token válido, device não aprovado |
| `DEVICE_REVOKED` | 403 | device revogado |
| `INSUFFICIENT_SCOPE` | 403 | autenticado, sem o escopo necessário |

Distinguir `401` de `403` importa: `401` diz "renove e tente de novo"; `403` diz "não adianta
insistir". Cliente que trata os dois igual entra em laço de renovação.

Ver [04-errors-and-http.md](04-errors-and-http.md).

---

## Logging

Ver [03-logging.md](03-logging.md). Específico daqui:

- **Nunca** logue o token, nem truncado. Logue `sub`, `jti`, `kid` e `exp`.
- Toda falha de validação é `warn` com o motivo **exato** no log (mesmo que a resposta HTTP
  seja genérica).
- Login, logout, registro de device e revogação são `info` **e** entram em `audit`.

---

## Testes

- Unit: validação de token com JWKS **local e fixa** — assinatura inválida, `aud` errado,
  `iss` errado, expirado, `alg: none`, `kid` desconhecido.
- Integração: provedor OIDC **fake** em container (ex.: um servidor OIDC de teste), não o
  Auth0 real. Teste que depende de tenant externo é flaky e acopla o CI a um fornecedor.
- E2E: login completo com PKCE contra o provedor fake.
- **Nunca** use credencial real de Auth0 em teste automatizado.

Cobertura de 90 % em todas as dimensões vale aqui como em todo o resto — e o caminho de
erro é justamente o que precisa estar coberto. Ver
[06-testing-strategy.md](06-testing-strategy.md#cobertura).
