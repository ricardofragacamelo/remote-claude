# Plano 20 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

Os erros aqui são de **script de operador**, não da API: saem como mensagem no terminal e código
de saída 1, sem `code` do catálogo — que é o contrato do backend com os clientes.

---

## Origem pública e ambiente — B-01

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | `https://host` é aceita: origem e host | eq | unit | — | B-01 | ✅ |
| S-02 | um hostname puro ganha `https://` | eq | unit | — | B-01 | ✅ |
| S-03 | barra final é aceita e some da origem | fron | unit | — | B-01 | ✅ |
| S-04 | `http://` é recusada: fora do loopback, só TLS | err | unit | `not-https` | B-01 | ✅ |
| S-05 | caminho, query, fragmento, porta ou credenciais são recusados | err | unit | `not-an-origin` | B-01 | ✅ |
| S-06 | valor ilegível é recusado | err | unit | `unreadable` | B-01 | ✅ |
| S-07 | o issuer público é a origem mais o caminho do `OIDC_ISSUER` | eq | unit | — | B-01 | ✅ |
| S-08 | sem `--public`, um `RC_PUBLIC_URL` do `.env` não chega aos filhos | est | unit | — | B-01 | ✅ |
| S-09 | montar o ambiente público duas vezes dá o mesmo ambiente | idem | unit | — | B-01 | ✅ |

## O túnel — B-02

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-10 | com domínio, o argv leva `--url`; sem domínio, não leva | eq | unit | — | B-02 | ✅ |
| S-11 | a linha `started tunnel` dá a URL | eq | unit | — | B-02 | ✅ |
| S-12 | linha `eror`/`crit` dá a primeira linha do erro e o `ERR_NGROK_nnn` | err | unit | — | B-02 | ✅ |
| S-13 | linha que não é JSON, ou JSON sem os campos, é ignorada | fron | unit | — | B-02 | ✅ |
| S-14 | o túnel sai antes de abrir: a falha diz o erro que ele deu | err | integração | `tunnel exited` | B-02 | ✅ |
| S-15 | o túnel não abre no prazo: a falha diz que esperou e quanto | fron | integração | `no endpoint within` | B-02 | ✅ |
| S-16 | um túnel que abre resolve com a URL, e o processo fica de pé | eq | integração | — | B-02 | ✅ |
| S-17 | o binário não existe: a falha vem antes de qualquer compose | err | integração | `tunnel not found` | B-02 | ✅ |
| S-18 | o túnel abriu num domínio diferente do pedido: recusado | err | unit | `tunnel-mismatch` | B-02 | ✅ |

## O authtoken do túnel — B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-37 | o arquivo existe: o token, sem espaço nem quebra de linha, vai só para o ambiente do túnel | eq | unit | — | B-07 | ✅ |
| S-38 | o arquivo não existe, ou está vazio: o túnel usa a config dele | fron | integração | — | B-07 | ✅ |
| S-39 | `NGROK_AUTHTOKEN` já exportado vence o arquivo | est | unit | — | B-07 | ✅ |
| S-40 | arquivo legível por grupo ou outros: aviso com o `chmod 600` | err | integração | `readable by others` | B-07 | ✅ |
| S-41 | o token nunca entra no `process.env` do script, nem no ambiente do backend e do web | eq | unit | — | B-07 | ✅ |

## O redirect no realm — B-03

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-19 | client sem a origem: ela entra nas duas listas, o resto do client fica | eq | unit | — | B-03 | ✅ |
| S-20 | client que já tem a origem: nenhuma escrita | idem | integração | — | B-03 | ✅ |
| S-21 | admin recusado (401): a falha nomeia `RC_KEYCLOAK_ADMIN` | err | integração | `admin login refused` | B-03 | ✅ |
| S-22 | o client web não existe no realm: a falha nomeia o client | err | integração | `client not found` | B-03 | ✅ |
| S-23 | `post.logout.redirect.uris` ausente ou vazio vira só a origem | fron | unit | — | B-03 | ✅ |

## O Keycloak público — B-04

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-24 | modo público: os dois `-f` vão antes do subcomando, em toda chamada | eq | unit | — | B-04 | ✅ |
| S-25 | modo local depois do público: nenhum `-f`, e o compose recria o Keycloak sem hostname | est | unit | — | B-04 | ✅ |
| S-26 | o override só mexe no Keycloak: `KC_HOSTNAME` e `KC_PROXY_HEADERS` | eq | unit | — | B-04 | ✅ |

## O web atrás da origem pública — B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-27 | sem `RC_PUBLIC_URL`, o bundle recebe exatamente as URLs de hoje | eq | unit | — | B-05 | ✅ |
| S-28 | com `RC_PUBLIC_URL`, a API é `<origem>/api` e o WebSocket `wss://<host>/ws` | eq | unit | — | B-05 | ✅ |
| S-29 | o dev server local é só porta e `strictPort` | eq | unit | — | B-05 | ✅ |
| S-30 | o dev server público aceita o host, o HMR sai pela 443 e há quatro rotas de proxy | eq | unit | — | B-05 | ✅ |
| S-31 | `/admin` não é encaminhado ao Keycloak | err | integração | 404 do app | B-05 | ✅ |
| S-32 | Vite de verdade: `/api/x` chega como `/x`, o cookie `Path=/auth` volta como `/api/auth`, `/ws` faz upgrade, `/realms` chega ao Keycloak | eq | integração | — | B-05 | ✅ |
| S-33 | host que não é o público nem `localhost` é recusado pelo Vite | fron | integração | 403 | B-05 | ✅ |

## O comando — B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-34 | Ctrl+C derruba web → backend → túnel → `compose stop` | est | e2e | — | B-06 | ⬜ |
| S-35 | segundo `dev:public` com o mesmo domínio: o túnel recusa e o script sai antes do compose | conc | e2e | `ERR_NGROK_334` | B-06 | ⬜ |
| S-36 | login, API e WebSocket de um navegador de fora, pela URL pública | eq | e2e | — | B-06 | ⬜ |

---

## Dimensões sem cenário — justificativa

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| B-01, B-03, B-04, B-05 | conc | configuração montada uma vez por subida, num processo só; a concorrência real é a de dois túneis no mesmo domínio (S-35) |
| B-02 | idem | subir o túnel duas vezes é o S-35 (concorrência), não repetição da mesma operação |
| B-07 | conc, idem | leitura de um arquivo, uma vez por subida; ler duas vezes é ler o mesmo arquivo |
| B-04, B-05 | idem | são funções puras do ambiente; a mesma entrada dá a mesma saída por construção |
| B-06 | nível e2e automatizado | S-34…S-36 exigem a conta do túnel e internet: não rodam na suíte; são verificados à mão e registrados no progresso |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
