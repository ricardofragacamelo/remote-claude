# F2 — Identidade

Plano: [05 — Endurecimento e operação](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-diagnostics.md).
**Entrega:** o sistema autentica contra um provedor OIDC real **por configuração**, com rotação
de refresh e revogação que alcança socket aberto.

> **Não comece com o R-01 em aberto** — qual provedor, qual tenant, qual audience e quem
> administra. Ver [riscos](README.md#riscos-e-decisões-em-aberto).

---

## A regra que não pode ser afrouxada aqui

**Nenhum código conhece o nome do provedor.** Trocar de fornecedor é trocar `OIDC_ISSUER`. O
que o código conhece é OIDC: discovery, JWKS, `iss`, `aud`, `alg`
([08-authentication](../../architecture/shared/08-authentication.md)).

E o teste automatizado continua falando com o **Keycloak local**. Teste que depende de tenant
externo é flaky e acopla o CI a um fornecedor.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-12 — Provedor real como configuração ✅

Discovery em `${issuer}/.well-known/openid-configuration`, cache com revalidação, recarga da
JWKS ao ver `kid` desconhecido, allowlist de `alg`.

**Nunca aceite o `alg` do token, nunca `none`.** Resposta `401` não revela qual validação
falhou; o log revela.

Claims exigidas ([D-06](decisions.md)): escopos `openid profile email` (e `offline_access` nos clientes); o token traz `sub`,
`email` e `email_verified: true`. Faltou qualquer uma, ou `email_verified` é `false` → `401`.
Nenhuma role ou grupo do provedor é lida — a autorização é local.

Achado na execução: a recarga da JWKS e a leitura do discovery não eram compartilhadas — a rajada
de requisições do boot lia o discovery várias vezes e **recusava** as que chegavam enquanto a JWKS
estava em voo, pelo intervalo de recarga que a primeira acabara de abrir (S-71). E a revalidação
do discovery que falhava derrubava toda requisição daquela hora; agora mantém o último documento
bom (S-70).

### B-13 — Rotação de refresh e detecção de reuso ✅

Refresh usado duas vezes significa credencial vazada → revoga a **família** inteira. Renovação
concorrente é deduplicada: uma chamada, todos aguardam.

Sem a deduplicação, o próprio produto dispara a detecção de reuso contra si mesmo. Cada cliente já
deduplicava as próprias renovações; o que faltava eram as **abas** do navegador, que mandam o mesmo
cookie — só o backend vê todas, e é lá que elas viram uma chamada. Refresh recusado apaga o cookie.
Rotação e revogação da família são do provedor: o realm tem `revokeRefreshToken` e
`refreshTokenMaxReuse: 0`, e um teste o lê (S-75).

E a aba que saiu com o token antigo **antes** de a rotação chegar ao navegador, mas chegou ao
backend **depois** dela, recebe a mesma rotação por até 10 s ([D-12](decisions.md), S-76) — sem
isso, a latência de rede bastava para derrubar a sessão de todas as abas.

### B-14 — Expiração com o socket aberto ✅

O socket **não** cai quando o token expira: o cliente renova e manda
`connection.reauthenticate`. Sem token válido até o fim da graça de 60 s, fecha com `4401`.

O web já renovava e entregava o token ao socket; o **app** só renovava ao tomar `401` ou ao voltar
do fundo — agora renova a 80 % da vida e manda `connection.reauthenticate` (S-72). E dois furos do
gateway, achados escrevendo S-69: um `connection.reauthenticate` com token de **outro** usuário
trocava a identidade da connection, e um enviado **antes** do handshake a autenticava sem nenhuma
das checagens do handshake. Os dois são recusados.

### B-15 — Logout no provedor, no web ✅

Além de limpar o estado local, chama o `end_session_endpoint`. O app já faz isso desde a
[F3 do plano 02](../02-mobile-approval/F3-mobile-permission.md); esta é a metade que faltava, e
estava anotada como dívida do bootstrap.

Não havia botão de sair no web: o `logout()` do hook existia e nenhuma tela o chamava. O **Sair**
entra na moldura comum (`Screen`). O backend devolve o ID token junto da sessão, que o web guarda em
memória para o `id_token_hint`; e o logout agora limpa o cache do TanStack Query, que ficava.

---

## Cenários cobertos

S-23…S-32, S-61, S-69…S-73, S-75…S-77.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
