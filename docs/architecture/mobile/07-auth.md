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

Aparelho **sem biometria e sem PIN** não aprova permissão: a tela recusa, diz **por quê** e
mostra o caminho para configurar o bloqueio do dispositivo. Observar sessão continua permitido —
a mesma assimetria do device pendente, que vê e não decide. Botão desabilitado sem motivo é regra
de segurança que parece bug.

Biometria indisponível ou recusada → cai para o PIN do dispositivo, nunca para "aprovar
direto". No código isso é um argumento: `biometricOnly: false`, e qualquer coisa que o prompt
responda que não seja "confirmado" — cancelado, bloqueado, prompt que não abriu — é "não".

A chave que desliga fica na tela inicial, **longe** do card que ela protege, e desliga o **pedido**,
não a regra acima: aparelho sem nenhum bloqueio continua sem aprovar com a chave em qualquer
posição. Negar nunca pede biometria. A preferência mora no armazenamento seguro e sobrevive ao
logout — é do aparelho, não da conta
([02 · D-25](../../plans/02-mobile-approval/decisions.md#d-25--o-que-a-chave-desliga)).

---

## Logout

A ordem é a regra ([02 · D-23](../../plans/02-mobile-approval/decisions.md#d-23--a-ordem-do-logout)):

1. **Desregistra o push token no backend** — primeiro, porque é uma chamada ao backend e precisa
   da credencial que o passo seguinte apaga. Falhar aqui é `warn`, nunca motivo para não sair: um
   logout que não completa sem rede deixa a credencial no aparelho.
2. Limpa o armazenamento seguro.
3. Chama o `end_session_endpoint` do provedor.
4. Fecha o WebSocket.
5. Invalida os providers Riverpod — **obrigatório**: dado do usuário anterior não pode
   aparecer para o próximo.

Pular o passo 1 faz o aparelho continuar recebendo notificação de permissão de uma conta da
qual ele saiu.

Quem sabe desregistrar é a feature `device`, e quem faz logout é `auth` — que `device` já importa.
Para a seta não voltar, o passo é **registrado** em `core/session/sign_out_hooks.dart` e o logout
roda o que estiver lá, antes de mexer no próprio estado. Fechar o socket e invalidar os providers é
do `app/` (`session_scope.dart`), que enxerga todas as features: ao ver "ninguém logado" ele fecha;
ao ver um login, abre o socket com a credencial nova.

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
