# F2 — Identidade

Plano: [05 — Endurecimento e operação](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-client-logs.md).
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

### B-12 — Provedor real como configuração 🔲

Discovery em `${issuer}/.well-known/openid-configuration`, cache com revalidação, recarga da
JWKS ao ver `kid` desconhecido, allowlist de `alg`.

**Nunca aceite o `alg` do token, nunca `none`.** Resposta `401` não revela qual validação
falhou; o log revela.

### B-13 — Rotação de refresh e detecção de reuso 🔲

Refresh usado duas vezes significa credencial vazada → revoga a **família** inteira. Renovação
concorrente é deduplicada: uma chamada, todos aguardam.

Sem a deduplicação, o próprio produto dispara a detecção de reuso contra si mesmo.

### B-14 — Expiração com o socket aberto 🔲

O socket **não** cai quando o token expira: o cliente renova e manda
`connection.reauthenticate`. Sem token válido até o fim da graça de 60 s, fecha com `4401`.

### B-15 — Logout no provedor, no web 🔲

Além de limpar o estado local, chama o `end_session_endpoint`. O app já faz isso desde a
[F3 do plano 02](../02-mobile-approval/F3-mobile-permission.md); esta é a metade que faltava, e
estava anotada como dívida do bootstrap.

---

## Cenários cobertos

S-23…S-32.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
