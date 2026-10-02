# Plano 20 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Stack pública

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Um domínio com proxy no Vite, ou um túnel por serviço | o plano gratuito tem um domínio fixo; o issuer precisa ser estável | B-05 | 2026-10-02 · **um domínio**, escolha do usuário: o Vite encaminha `/api` (sem o prefixo), `/ws`, `/realms` e `/resources`. O backend continua sem prefixo global | ✅ |
| D-02 | `RC_PUBLIC_URL` vale sempre que está no `.env`, ou só sob `--public` | um `.env` esquecido deixaria o `pnpm dev` com issuer público e sem túnel | B-01, B-06 | 2026-10-02 · **só sob `--public`**: sem a flag, `start-local` zera a variável no ambiente dos filhos e não usa o override de compose. Vazia com `--public`, o túnel usa o domínio da conta e diz qual é | ✅ |
| D-03 | Onde nasce o redirect da origem pública | o domínio é pessoal (não vai para o realm versionado), e o `--import-realm` ignora realm existente | B-03 | 2026-10-02 · **API admin, a cada subida pública**, idempotente: acrescenta `<origem>/*` a `redirectUris` e a `post.logout.redirect.uris` do client web. Não é removido ao sair do modo público — redirect só para o próprio domínio | ✅ |
| D-04 | O backend precisa de configuração nova | com o proxy, o navegador fala com a API na mesma origem | B-06 | 2026-10-02 · **não**: CORS não entra numa chamada de mesma origem, e o `OIDC_ISSUER` público chega pelo ambiente que o script monta. O backend busca discovery e JWKS pelo túnel (R-02) | ✅ |
| D-05 | Onde fica o authtoken do túnel | é segredo; o `scan:secrets` reprova no repositório | B-02, B-07 | 2026-10-02 · **fora do repositório**: `ngrok config add-authtoken` (arquivo do usuário) ou `NGROK_AUTHTOKEN`, que o próprio ngrok lê. O script nunca imprime o token. **Revista no mesmo dia, pedido do usuário:** o repositório guarda o token em `.secrets/ngrok-authtoken` (ignorado pelo git, como a credencial do push; o `gitleaks detect` varre o histórico, não o que é ignorado), e o script o entrega como `NGROK_AUTHTOKEN` **só ao processo do túnel**. Ordem: `NGROK_AUTHTOKEN` exportado → o arquivo → a config do próprio ngrok. Fora do `.env` de propósito: o `.env` vai inteiro para o backend e o web | ✅ |
| D-06 | O console admin do Keycloak atravessa o túnel | `admin/admin` é a senha de desenvolvimento | B-05 | 2026-10-02 · **não**: só `/realms` e `/resources` são encaminhados | ✅ |
| D-07 | O app mobile pela URL pública | o `dev:mobile` usa `adb reverse` e o issuer local | — | 2026-10-02 · **fora do escopo**, declarado no README | ✅ |
| D-08 | Como o Keycloak sabe que está atrás de HTTPS | o Vite fala HTTP com ele | B-04 | 2026-10-02 · `KC_HOSTNAME` = origem pública **e** `KC_PROXY_HEADERS=xforwarded`, num `docker-compose.public.yml` passado só no modo público. Medido no 26.2: issuer, endpoints e cookies (`Secure`) saem públicos; a API admin por `localhost` continua respondendo | ✅ |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
