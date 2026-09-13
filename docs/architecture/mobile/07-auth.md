# Autenticação no app Flutter

Implementa, no celular, o que está em
[autenticação (OIDC)](../shared/08-authentication.md). **Leia aquele documento primeiro.**

Voltar para o [índice do mobile](README.md).

---

## Fluxo: Authorization Code + PKCE, em aba externa

App móvel é **cliente público**: não guarda segredo. Por isso PKCE, e por isso não existe
`client_secret`.

```
entrar
 → gera code_verifier + code_challenge (S256) e state
 → abre a aba EXTERNA do sistema no authorization_endpoint
 → usuário autentica (biometria, MFA, SSO — tudo no provedor)
 → volta por deep link: com.remoteclaude://callback?code=…&state=…
 → valida state → troca code por tokens
 → guarda no armazenamento seguro do SO
```

### WebView é proibida

`ASWebAuthenticationSession` (iOS) e Custom Tabs (Android). **Nunca** `WebView` embutida.

Três razões, e todas importam:

1. WebView **não compartilha a sessão do SO** — o usuário faz login de novo mesmo já estando
   autenticado no provedor, e perde SSO corporativo.
2. O app **consegue ler o que é digitado** na WebView. Isso é exatamente o que o modelo de
   segurança do OAuth tenta impedir, e é motivo de rejeição em review de loja.
3. Gerenciador de senha e chave de acesso do SO não funcionam bem ali.

Pacote: `flutter_appauth` ou `oauth2_client` — ambos falam OIDC padrão, sem conhecer o
provedor.

---

## Onde a credencial mora

| Item | Onde |
|---|---|
| Access token | `flutter_secure_storage` (Keychain / EncryptedSharedPreferences) |
| Refresh token | idem |
| `code_verifier` | memória, apenas entre o redirect e o callback |

**`SharedPreferences` é proibido para credencial.** É texto claro em arquivo, legível em
aparelho com root/jailbreak e em backup. Regra de lint bloqueia gravação de chave de token ali.

No Android, `EncryptedSharedPreferences`; no iOS, Keychain com
`first_unlock_this_device` — não sincronize credencial via iCloud Keychain entre aparelhos:
cada device é registrado individualmente, e sincronizar quebra esse modelo.

---

## Deep link

```
com.remoteclaude://callback      # retorno do OIDC
```

Registrado no `AndroidManifest.xml` e no `Info.plist`. O `state` é validado **sempre** —
sem isso, o callback aceita código de outra origem.

Deep link **não** reutilizável: consumido uma vez, `code_verifier` descartado em seguida.

---

## Registro e aprovação de device

Token OIDC prova *quem*. Registro de device prova *de onde*. Como a decisão autorizada executa
comando na máquina do usuário, as duas coisas são necessárias — ver
[08-authentication.md](../shared/08-authentication.md#device-e-o-canal-mobile).

```
login OIDC ok
 → app registra o device: nome, plataforma, versão, push token, locale
 → device entra como PENDENTE
 → aprovação a partir de uma sessão já confiável (web)
 → só então pode responder permission requests
```

Enquanto pendente, o app **mostra o estado claramente** e permite observar sessões, mas os
controles de aprovação ficam desabilitados com explicação. Esconder o motivo transforma uma
regra de segurança em bug aparente.

`Device.locale` é o que decide o idioma do **push** — ver [i18n](../shared/02-i18n.md).

---

## Renovação

- **Proativa**, a ~80 % da vida do token. Renovar só depois do `401` faz a expiração virar
  falha visível — e, no mobile, frequentemente em cima de uma permissão expirando.
- Renovação concorrente **deduplicada**: uma chamada, todos aguardam. Sem isso, o provedor
  invalida a família de tokens por reuso.
- No retorno do background, **revalide antes** de reconectar o socket: o token provavelmente
  expirou enquanto o app estava parado.
- Refresh falhou → limpa credencial e vai para o login. Sem recuperação silenciosa.

---

## Biometria

Exigir biometria (`local_auth`) para **aprovar permissão**, opcional e ligada por default.

O app fica desbloqueado no bolso; aprovar execução de comando destrutivo merece uma barreira a
mais. Isso é complementar à [confirmação em dois passos](04-ui.md#a-tela-de-permissão), não
substituto — uma protege contra toque acidental, a outra contra aparelho nas mãos erradas.

Biometria indisponível ou recusada → cai para o PIN do dispositivo, nunca para "aprovar
direto".

---

## Logout

1. Limpa o armazenamento seguro.
2. Fecha o WebSocket.
3. Invalida os providers Riverpod — **obrigatório**: dado do usuário anterior não pode
   aparecer para o próximo.
4. Desregistra o push token no backend.
5. Chama o `end_session_endpoint` do provedor.

Pular o passo 4 faz o aparelho continuar recebendo notificação de permissão de uma conta da
qual ele saiu.

---

## Logging

Ver [05-logging.md](05-logging.md). Específico daqui:

- **Nunca** logue token, `code` ou `code_verifier`. Nem truncado.
- Logue `sub`, `exp`, `deviceId`, e o resultado da validação.
- Falha de validação de `state` é `warn` — sinal de ataque ou bug sério.
- Login, logout, registro e revogação de device são `info`.

---

## Testes

- Unit: PKCE, validação de `state`, deduplicação de refresh, expiração, revalidação no
  retorno do background.
- Widget: estado "device pendente" desabilita os controles com explicação visível.
- E2E (`patrol`): login na aba externa do sistema, retorno por deep link, biometria.
- **Nunca** use tenant real de Auth0 em teste automatizado — provedor OIDC fake em container.

Cenários de erro obrigatórios: `state` inválido, `code` expirado, refresh reusado, provedor
fora do ar, deep link duplicado, device revogado com o app aberto.
