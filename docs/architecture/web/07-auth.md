# Autenticação no web

Implementa, no browser, o que está em
[autenticação (OIDC)](../shared/08-authentication.md). **Leia aquele documento primeiro** —
aqui está só o que é específico do front.

Voltar para o [índice do web](README.md).

---

## Fluxo: Authorization Code + PKCE

SPA é **cliente público**: não guarda segredo, porque tudo que vai para o bundle é legível.
Por isso PKCE, e por isso não existe `client_secret` neste projeto.

```
entrar
 → gera code_verifier + code_challenge (S256) e state
 → redireciona para o authorization_endpoint (vindo do discovery)
 → provedor autentica
 → volta em /callback?code=…&state=…
 → valida state  → troca code por tokens
 → access token em memória · refresh token em cookie httpOnly
```

`state` é validado **sempre**. Sem isso, o callback aceita código de outra origem (CSRF).
`code_verifier` fica em `sessionStorage` apenas entre o redirect e o callback, e é apagado
logo depois.

---

## Onde o token mora — e onde não mora

| Token | Onde | Por quê |
|---|---|---|
| Access | **memória** (módulo, não store persistido) | morre com a aba; XSS não consegue persistir roubo |
| Refresh | **cookie `httpOnly` + `Secure` + `SameSite=Strict`** | JS não alcança |
| ID | memória, só para ler claims | não é credencial de API |

**`localStorage` é proibido para token.** Qualquer script na página o lê — um XSS vira sessão
permanente do atacante. Regra de lint bloqueia `localStorage.setItem` com chave de token.

O `client_id` **é** público e pode ir no bundle. Isso é OIDC por definição, não descuido.

---

## Renovação

- **Proativa**, antes de expirar (a ~80 % da vida do token). Renovar só depois de tomar `401`
  transforma toda expiração em falha visível.
- Renovação concorrente é **deduplicada**: N requisições disparando refresh ao mesmo tempo
  fazem **uma** chamada, e todas aguardam o mesmo resultado. Sem isso, o provedor invalida a
  família de tokens por reuso.
- Falhou o refresh → limpa o estado e manda para o login. Não tente se recuperar em silêncio.

---

## Integração com a cadeia

A autenticação não escapa da [cadeia](01-architecture.md):

```
Componente → useAuth (hook) → authService → api.ts / wsClient
```

- **`api.ts`** anexa o `Authorization: Bearer` no interceptor, e no `401` dispara a renovação
  e repete a requisição **uma** vez.
- **`wsClient`** manda o token no `connection.authenticate` e, quando expira com o socket
  aberto, envia `connection.reauthenticate` — sem derrubar a conexão. Ver
  [contrato](../shared/05-websocket-protocol.md#handshake).
- **Componente** só conhece `useAuth()`: `user`, `isAuthenticated`, `login()`, `logout()`.
  Nenhum componente sabe que existe OIDC.

---

## Rota protegida

Guard no roteador, não dentro de componente. Enquanto o estado de auth está indefinido,
renderize um estado de carregamento — não redirecione. Redirecionar cedo demais joga o
usuário para o login no F5, mesmo com sessão válida.

Após o login, volte para a rota pretendida, guardada antes do redirect.

---

## Logout

1. Limpa o token em memória e o cookie de refresh.
2. Fecha o WebSocket.
3. Limpa o cache do TanStack Query — **obrigatório**: dado do usuário anterior não pode
   aparecer para o próximo.
4. Redireciona para o `end_session_endpoint` do provedor, para encerrar a sessão lá também.

Pular o passo 4 deixa o usuário "deslogado" no app e ainda logado no provedor — o próximo
clique em entrar volta sem pedir credencial, o que parece falha de segurança.

---

## Registro de device

O web não é um device que aprova permissão por push, mas é de onde os **devices móveis
pendentes são aprovados**. A tela de gerenciamento mostra os aparelhos, o estado de cada um
e permite revogar.

Revogar é ação destrutiva: exige confirmação, e o botão **não** recebe foco inicial. Ver
[03-ui-system.md](03-ui-system.md#acessibilidade--não-é-opcional).

---

## Logging

Ver [05-logging.md](05-logging.md). Específico daqui:

- **Nunca** logue token, `code` ou `code_verifier`. Nem truncado.
- Logue `sub`, `exp`, e o resultado da validação.
- Login, logout e falha de renovação são `info`. Falha de validação de `state` é `warn` — é
  sinal de ataque ou de bug sério.

---

## Testes

- Unit: geração e verificação de PKCE, validação de `state`, deduplicação de refresh
  concorrente, expiração.
- Integração: fluxo completo contra provedor OIDC **fake**, com MSW.
- E2E: login, rota protegida, expiração com socket aberto, logout limpando o cache.
- **Nunca** use tenant real de Auth0 em teste automatizado.

Cenários de erro obrigatórios: `state` inválido, `code` expirado, refresh reusado, provedor
fora do ar, relógio adiantado.
