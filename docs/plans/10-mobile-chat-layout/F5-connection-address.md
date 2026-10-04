# F5 — Endereço de conexão

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-inline.md).
**Entrega:** o app escolhe, em tempo de execução, por qual endereço fala com o servidor. Uma tela com
três radios:

- **Interno**, o endereço da rede local;
- **Externo**, o endereço da internet;
- **Outro**, com um campo de texto livre.

O endereço escolhido é uma **origem só**, e dela saem a API (`/api`), o WebSocket (`/ws`) e o login
(`/realms/<realm>`). A escolha fica guardada no aparelho: sobrevive ao reinício, ao logout e à
atualização do app ([D-18](decisions.md#f5--endereço-de-conexão)). O backend aceita o login vindo de cada
origem configurada.

**Por que antes do e2e:** esta fase muda a forma de subir o app, porque os defines `RC_API_URL`,
`RC_WS_URL` e `RC_OIDC_ISSUER` dão lugar a uma origem. Vindo antes, a [F10](F10-e2e.md) prova o layout e o
endereço juntos, com a forma que fica, e o e2e roda uma vez só no fim
([D-11](decisions.md#f5--endereço-de-conexão)). Por isso esta fase entrega os testes unit e de
integração das suas tarefas, e a prova no emulador é a [B-30](F10-e2e.md#b-30--o-endereço-no-emulador-),
na F10. As suítes que já existem continuam rodando aqui, porque a forma de subir o app muda nesta fase.

**Decisões que precisam estar fechadas para começar:** D-11…D-18, fechadas
([decisions.md](decisions.md#f5--endereço-de-conexão)). A D-15 é condicionada ao spike da
[B-25](#b-25--spike-o-login-por-duas-origens-): se ele reprovar, ela volta a ficar aberta e trava a
[B-26](#b-26--o-backend-aceita-o-login-de-cada-origem-).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-25 — Spike: o login por duas origens ✅

O backend valida o `iss` contra **um** issuer ([shared/08 · Validação no backend](../../architecture/shared/08-authentication.md#validação-no-backend)),
e o Keycloak escreve no `iss` o host por onde foi chamado, a menos que o `KC_HOSTNAME` o fixe
([20 · D-08](../20-dev-public/decisions.md)). O spike mede, no Keycloak da stack (26.x):

- sem `KC_HOSTNAME` e com `KC_PROXY_HEADERS`, o `iss` de um token pedido pela origem do proxy e o de um
  pedido direto na porta;
- se a JWKS é a mesma pelas duas origens, ou seja, se as chaves são do realm e não do host;
- o que o discovery devolve em cada origem, que é o que o AppAuth do app usa.

O resultado confirma a [D-15](decisions.md#f5--endereço-de-conexão), a lista explícita de issuers. Se a
medida mostrar que a lista não funciona, a fase **para**: a D-15 volta a ficar aberta com o que se mediu,
e o usuário decide.

### B-26 — O backend aceita o login de cada origem ✅

Pela [D-15](decisions.md#f5--endereço-de-conexão): uma lista explícita de issuers na configuração, cada
um com o seu discovery e o seu cache de JWKS, e a mesma `aud`. Vale para HTTP e para o handshake do WS. A
regra "um issuer" do `shared/08` muda, e a mudança vira uma
[ADR](../../architecture/shared/00-decisions.md) na mesma entrega. O que não muda:

- token de issuer fora da lista dá `401 UNAUTHENTICATED`, e o passo que falhou vai só para o log;
- a lista com um issuer só se comporta exatamente como hoje;
- a configuração inválida não deixa o processo subir;
- a leitura em voo continua compartilhada, agora **por issuer**;
- a revalidação que falha mantém o último documento bom **daquele** issuer, sem tocar no outro.

Atualiza [shared/08 · Configuração](../../architecture/shared/08-authentication.md#configuração) e o
`.env.example`.

### B-27 — A origem única no dev e no e2e ✅

Pela [D-16](decisions.md#f5--endereço-de-conexão), o encaminhamento do plano 20 deixa de ser só do modo
público ([20 · D-01](../20-dev-public/decisions.md)): o servidor do web encaminha `/api` (sem o prefixo,
com o caminho do cookie de refresh), `/ws`, `/realms` e `/resources` também no modo local. O console admin
continua de fora (20 · D-06).

- `scripts/lib/stack.mjs` e `scripts/lib/mobile-local.mjs` passam a gerar `RC_INTERNAL_URL`
  (`http://localhost:<porta do web>`, alcançada pelo `adb reverse`), `RC_EXTERNAL_URL` (vazia, ou a
  origem pública sob `--public`) e `RC_OIDC_REALM_PATH`. `RC_API_URL`, `RC_WS_URL` e `RC_OIDC_ISSUER`
  saem.
- A suíte `limits`, que hoje troca a URL da API, passa a trocar a origem.
- O `adb reverse` do `scripts/mobile.mjs` passa a incluir a porta do web.
- O mesmo encaminhamento é o que a infraestrutura precisa fazer em produção
  ([19 · D-04](../19-distribution/decisions.md)). A tarefa registra isso na F1 do plano 19.

### B-28 — A origem no app: derivar, validar e guardar ✅

No `core/config` do app, pela [estrutura normativa](../../architecture/mobile/02-folder-structure.md):

- **Derivar.** De uma origem saem a API (`<origem>/api`), o WS (`wss://<host>/ws`, ou `ws://` para
  `http://localhost`) e o issuer (`<origem>` + `RC_OIDC_REALM_PATH`). O `AppConfig` deixa de ser fixo no
  boot: o `appConfigProvider` deriva dos defines **e** da escolha guardada.
- **Validar** ([D-14](decisions.md#f5--endereço-de-conexão)): só `https://`. A exceção é `http://` para
  `localhost` e `127.0.0.1`, o caminho do dev e do e2e. Uma origem só: o endereço com caminho, query,
  fragmento ou usuário é recusado, com o motivo. Barra no fim, porta explícita, host em maiúsculas e
  IPv6 entre colchetes são normalizados.
- **Guardar** ([D-18](decisions.md#f5--endereço-de-conexão)): a escolha (interno, externo ou outro) e o
  texto do campo livre ficam no `flutter_secure_storage`, o único armazenamento do app, em chaves
  `rc.connection.*`. Elas ficam fora de `CredentialKeys.all`, como as `DeviceKeys`, e por isso o
  `clear()` do logout não as toca. O texto do campo livre fica guardado mesmo com outro radio marcado.
  Valor ilegível volta ao padrão com um `warn`, nunca derruba o app.
- **Padrão** ([D-17](decisions.md#f5--endereço-de-conexão)): sem escolha guardada, vale o interno; se o
  interno não foi definido, o externo; sem nenhum dos dois, o app abre na tela de endereço. Se a escolha
  guardada aponta para um radio que o build novo não define mais, vale o padrão, e a tela diz por quê.
- **Trocar:** com sessão de login aberta, trocar de origem encerra o login, porque o token é de outro
  issuer. Limpa as credenciais, reconstrói o cliente HTTP, o socket e o OIDC na origem nova e volta ao
  login. A resposta de um pedido feito na origem velha é descartada, e nenhum token velho chega à origem
  nova. Salvar a mesma escolha de novo não faz nada.

Atualiza [mobile/03 · Rede](../../architecture/mobile/03-state-and-data.md#rede) e
[mobile/07](../../architecture/mobile/07-auth.md), e o `mobile/README.md` com os defines novos.

### B-29 — A tela de endereço ✅

`ConnectionPage`, na rota `/connection`:

- Três radios, cada um com o endereço por extenso embaixo. O radio cujo define está vazio fica
  desabilitado e diz por quê. O campo do **Outro** só se habilita com o radio dele, com teclado de URL e
  sem autocorreção.
- **Testar conexão:** `GET <origem>/api/health` e o discovery do issuer derivado, cada um com o seu
  resultado traduzido (servidor fora do alcance, login indisponível, ok). Um teste por vez.
- **Salvar** fica desabilitado enquanto o endereço é inválido, com o motivo à vista. Com o login aberto,
  pede confirmação: "trocar o endereço encerra o seu login".
- **Alcance:** sem login, pela tela de entrada. A rota fica fora do `redirectFor`, senão um endereço
  errado trancaria o app do lado de fora. Com login, por um item no menu do app.
- Ajuda da tela, as chaves nos dois ARB, `Semantics` em cada radio e fonte em 200 %.

---

## Cenários cobertos

S-85…S-109. A prova no emulador (S-110…S-113) é da [F10](F10-e2e.md#b-30--o-endereço-no-emulador-).

---

## Critério de conclusão

```bash
pnpm test:e2e:mobile   # as suítes que já existem, com a forma nova de subir o app
pnpm verify
```
