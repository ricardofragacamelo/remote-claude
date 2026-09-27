# Plano 05 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

---

## Limites e ciclo de vida — B-01…B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | máquina com menos memória disponível permite menos sessões | eq | unit | — | B-01 | ✅ |
| S-02 | abrir uma sessão acima do teto calculado | fron | integração | `SESSION_LIMIT_REACHED` | B-01 | ✅ |
| S-03 | fechar uma sessão libera a vaga imediatamente | est | integração | — | B-01 | ✅ |
| S-04 | sessão ociosa além do TTL é encerrada com `session.closed` | est | integração | — | B-02 | ✅ |
| S-05 | sessão esperando permissão **não** é encerrada pelo TTL | fron | integração | — | B-02 | ✅ |
| S-06 | subprocesso órfão do backend anterior é encerrado no boot | est | integração | — | B-03 | ✅ |
| S-07 | a varredura de órfã **não** encerra processo que não é nosso | err | integração | — | B-03 | ✅ |
| S-08 | shutdown fecha todas as sessões e não deixa processo vivo | est | integração | — | B-04 | ✅ |
| S-09 | shutdown fecha os sockets com `1001` | est | integração | — | B-04 | ✅ |
| S-10 | frames acima do limite → `RATE_LIMITED`; reincidência → `4429` | fron | integração | `RATE_LIMITED` | B-05 | ✅ |
| S-11 | frame acima do tamanho anunciado | fron | integração | `PAYLOAD_TOO_LARGE` | B-06 | ✅ |
| S-12 | toda resposta `429` e `503` traz `Retry-After` | err | integração | `RATE_LIMITED` | B-05 | ✅ |
| S-13 | dois clientes disputando a última vaga: um entra, o outro recebe erro | conc | integração | `SESSION_LIMIT_REACHED` | B-01 | ✅ |
| S-14 | chamar o shutdown duas vezes é inofensivo | idem | unit | — | B-04 | ✅ |
| S-59 | `session.attach` ou `session.start` além das sessões anexadas permitidas → recusado **antes** de qualquer subprocesso; reanexar a sessão já anexada passa | fron | integração | `RATE_LIMITED` | B-05 | ✅ |
| S-60 | heartbeat mantido com o cliente enviando frames sem parar; cliente que não responde o `ping` fecha com `4408` | est | integração | — | B-07 | ✅ |

## Herdadas do plano 04 — B-26, B-27

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-54 | prompt enquanto um desfazer devolve os arquivos → recusado, e nenhum turno roda | est | unit | `SESSION_LOCKED` | B-27 | ✅ |
| S-55 | slash command cujo menu estava sendo lido quando o desfazer começou → recusado depois da leitura | conc | unit | `SESSION_LOCKED` | B-27 | ✅ |
| S-56 | retomada sem resposta até o prazo do cliente → a tela para de esperar, diz por quê e deixa tentar de novo (web e app) | fron | unit | `RESUME_TIMEOUT` | B-26 | ✅ |
| S-57 | retomada respondida (ou recusada) antes do prazo → o prazo nunca dispara | idem | unit | — | B-26 | ✅ |
| S-58 | prompt enviado logo atrás de um desfazer, pelo gateway → `SESSION_LOCKED` com `rewindRunning`, e o desfazer conclui | conc | integração | `SESSION_LOCKED` | B-27 | ✅ |

## Nova tentativa do push — B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-47 | provedor falha uma vez e entrega na segunda: o aparelho recebe **uma** notificação | eq | unit | — | B-25 | ✅ |
| S-48 | falha em todas as tentativas: para no limite, e loga um `warn` só, com o número de tentativas | fron | unit | — | B-25 | ✅ |
| S-49 | `tokenRejected` **não** é tentado de novo, e o token é apagado mantendo o device aprovado | err | unit | — | B-25 | ✅ |
| S-50 | pedido resolvido durante o recuo: a tentativa pendente é cancelada e nenhum aviso chega depois da retirada | est | integração | — | B-25 | ✅ |
| S-51 | retirada chegando enquanto uma nova tentativa do aviso está em voo: o aparelho termina sem card | conc | integração | — | B-25 | ✅ |
| S-52 | a nova tentativa manda a mesma tag do pedido: se a primeira tinha entrado, o aparelho segue com uma notificação só | idem | unit | — | B-25 | ✅ |
| S-53 | provedor de teste falha a primeira chamada e o aparelho recebe a notificação mesmo assim | eq | e2e | — | B-25 | ✅ |

## Diagnóstico — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-21 | a tela de diagnóstico liga `debug` e o desliga ao sair | est | widget | — | B-11 | ✅ |

## Identidade — B-12…B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-23 | discovery do issuer configurado é lido e cacheado | eq | integração | — | B-12 | ⬜ |
| S-24 | `kid` desconhecido recarrega a JWKS **uma** vez | est | integração | — | B-12 | ⬜ |
| S-25 | `alg: none` e algoritmo fora da allowlist são recusados | err | unit | `UNAUTHENTICATED` | B-12 | ⬜ |
| S-26 | `aud` ou `iss` errados → `401` sem dizer qual passo falhou | err | integração | `UNAUTHENTICATED` | B-12 | ⬜ |
| S-27 | refresh reusado revoga a família inteira de tokens | err | integração | `UNAUTHENTICATED` | B-13 | ⬜ |
| S-28 | N renovações concorrentes fazem **uma** chamada ao provedor | conc | integração | — | B-13 | ⬜ |
| S-29 | token expira com o socket aberto → `reauthenticate` mantém a conexão | est | integração | — | B-14 | ⬜ |
| S-30 | sem token válido até o fim da graça de 60 s → fecha `4401` | fron | integração | `TOKEN_EXPIRED` | B-14 | ⬜ |
| S-31 | logout chama o `end_session_endpoint` e limpa o estado local | est | integração | — | B-15 | ⬜ |
| S-32 | nome de provedor fora da configuração → `scan:security` falha | err | unit | — | B-12 | ⬜ |
| S-61 | token sem `sub`, sem `email`, ou com `email_verified: false` → `401`, e o usuário não é provisionado | err | integração | `UNAUTHENTICATED` | B-12 | ⬜ |

## Portões — B-16, B-19, B-20, B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-33 | dependência com vulnerabilidade conhecida reprova o portão | err | unit | — | B-16 | ⬜ |
| S-34 | versão exatamente na borda do intervalo vulnerável é reprovada | fron | unit | — | B-16 | ⬜ |
| S-35 | scanner indisponível **falha** o portão, em vez de passar em silêncio | err | unit | — | B-16 | ⬜ |
| S-37 | `smoke-live` falhando no nightly abre issue | est | e2e | — | B-19 | ⬜ |
| S-38 | nightly verde não abre issue nem fecha issue alheia | idem | e2e | — | B-19 | ⬜ |
| S-39 | `doctor` detecta o pré-requisito novo e diz como resolver | err | e2e | — | B-20 | ⬜ |
| S-40 | dois jobs de CI simultâneos não disputam porta nem projeto compose | conc | e2e | — | B-19 | ⬜ |
| S-62 | função TS/JS com complexidade 10 passa; com 11 reprova pela regra `complexity` | fron | unit | — | B-28 | ✅ |
| S-63 | a regra vale em backend, web, `packages`, `e2e`, testes e scripts — nenhum escopo escapa | eq | unit | — | B-28 | ✅ |
| S-64 | função Dart com complexidade 10 passa; com 11 faz `mobile.mjs analyze` sair ≠ 0, nomeando a função | fron | integração | — | B-28 | ✅ |
| S-65 | a saída da métrica é lida: arquivo, função e valor de cada violação | eq | unit | — | B-28 | ✅ |
| S-66 | métrica que não terminou (código inesperado, ou sem a linha de conclusão) reprova, em vez de passar em silêncio | err | unit | — | B-28 | ✅ |
| S-67 | código gerado (`*.g.dart`, `lib/l10n/generated`) fica fora da medição | eq | integração | — | B-28 | ✅ |
| S-68 | o código de hoje passa nas duas pontas, com as 27 funções refatoradas | est | integração | — | B-28 | ✅ |

## E2E — B-21…B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-41 | abrir sessões até o teto → erro traduzido, com o motivo | fron | e2e | `SESSION_LIMIT_REACHED` | B-22 | ⬜ |
| S-42 | sessão ociosa expira e a UI mostra que ela foi encerrada | est | e2e | — | B-22 | ⬜ |
| S-43 | cliente que martela recebe `Retry-After` e **espera** | err | e2e | `RATE_LIMITED` | B-22 | ⬜ |
| S-44 | token expira no meio do turno e o usuário não percebe nada | est | e2e | — | B-23 | ⬜ |
| S-45 | dois clientes disputando a última vaga pela porta do usuário | conc | e2e | `SESSION_LIMIT_REACHED` | B-21 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Herdadas do plano 04 (B-26, B-27) | `eq`, `err` | o caminho feliz de retomar e de desfazer é do [plano 04](../04-transcript-and-resume/scenarios.md), já coberto; aqui só entra o que ele deixou aberto — o prazo e a trava |
| Identidade (B-12…B-15) | `idem` | renovação de credencial é, por desenho, **não** idempotente: o refresh rotaciona. A repetição que importa é o **reuso**, e ela tem tratamento próprio em S-27 |
| Complexidade (B-28) | `idem`, `conc`, e o nível e2e | a análise é leitura pura da árvore: rodar duas vezes dá o mesmo veredito, e não há estado a disputar — o que a concorrência poderia quebrar é a sonda que o teste escreve em `lib/`, e ela tem nome próprio (`_arch_complexity_probe.dart`). Um portão não tem porta de usuário; o seu "fim a fim" é o processo rodado pelo terminal, e isso é a integração (S-64, S-68) |
| E2E (B-21…B-23) | `idem` | repetição aqui é reconexão, determinística e coberta no [plano 01](../01-live-session/scenarios.md); em e2e só acrescentaria tempo |
