# Plano 06 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

---

## Empacotamento e instalação — B-01…B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | instalar numa máquina limpa sobe o serviço e o `/health` responde | eq | e2e | — | B-05 | ⬜ |
| S-02 | o serviço roda como o usuário dono e **encontra** a credencial do Claude | eq | integração | — | B-02 | ⬜ |
| S-03 | instalar duas vezes seguidas leva ao mesmo estado | idem | e2e | — | B-05 | ⬜ |
| S-04 | configuração incompleta impede a subida, dizendo qual variável falta | err | unit | — | B-04 | ⬜ |
| S-05 | allowlist de workspace não configurada impede a subida | err | unit | — | B-04 | ⬜ |
| S-06 | porta ocupada → erro claro, não crash silencioso | err | e2e | — | B-02 | ⬜ |
| S-07 | migration é aplicada na subida, atrás do advisory lock | est | integração | — | B-03 | ⬜ |
| S-08 | duas instâncias subindo juntas aplicam a migration **uma** vez | conc | integração | — | B-03 | ⬜ |
| S-09 | desinstalar remove o serviço, mantém os dados e diz onde estão | est | e2e | — | B-06 | ⬜ |
| S-10 | desinstalar duas vezes é inofensivo | idem | e2e | — | B-06 | ⬜ |
| S-11 | espaço em disco insuficiente falha **antes** de começar a instalar | fron | e2e | — | B-05 | ⬜ |
| S-12 | pré-requisito ausente (Node, Docker, Claude) reprova antes de instalar | fron | e2e | — | B-05 | ⬜ |

## Exposição — B-07…B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-13 | sem configuração, o backend escuta **só** em loopback | eq | integração | — | B-07 | ⬜ |
| S-14 | expor fora do loopback sem TLS impede a subida | err | unit | — | B-11 | ⬜ |
| S-15 | exposto com TLS válido, sobe e responde | eq | e2e | — | B-08 | ⬜ |
| S-16 | certificado expirado ou ilegível → erro claro na subida | err | e2e | — | B-08 | ⬜ |
| S-17 | origem não permitida é recusada pelo CORS | err | integração | `FORBIDDEN` | B-09 | ⬜ |
| S-18 | rota protegida sem credencial | err | integração | `UNAUTHENTICATED` | B-09 | ⬜ |
| S-19 | cabeçalhos de segurança presentes em toda resposta | eq | integração | — | B-09 | ⬜ |
| S-20 | handshake do WebSocket com origem desconhecida é recusado | err | integração | `FORBIDDEN` | B-09 | ⬜ |
| S-21 | mudar a exposição exige reinício, sem estado meio-aplicado | est | e2e | — | B-11 | ⬜ |
| S-22 | dois processos na mesma porta: um sobe, o outro falha com clareza | conc | e2e | — | B-07 | ⬜ |

## Atualização — B-12…B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-23 | atualizar o SDK com `smoke-live` verde conclui a atualização | eq | e2e | — | B-12 | ⬜ |
| S-24 | `smoke-live` vermelho **interrompe** a atualização e diz o que mudou | err | e2e | — | B-12 | ⬜ |
| S-25 | atualizar aplica a migration nova e preserva os dados | est | e2e | — | B-13 | ⬜ |
| S-26 | editar migration já aplicada reprova no portão | err | unit | — | B-13 | ⬜ |
| S-27 | atualizar duas vezes para a mesma versão é inofensivo | idem | e2e | — | B-12 | ⬜ |
| S-28 | o backup gera um arquivo restaurável | eq | e2e | — | B-14 | ⬜ |
| S-29 | restaurar devolve o sistema coerente, com a trilha intacta | est | e2e | — | B-14 | ⬜ |
| S-30 | backup com o sistema no ar não corrompe nem bloqueia escrita | conc | e2e | — | B-14 | ⬜ |
| S-31 | backup de versão mais nova em binário mais velho é recusado | fron | e2e | — | B-14 | ⬜ |
| S-32 | versões de backend, web, app e SDK visíveis na UI e no log | eq | integração | — | B-15 | ⬜ |

## E2E de instalação — B-16…B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-33 | `dist:verify` instala, sobe, faz o smoke e desinstala, saindo 0 | eq | e2e | — | B-17 | ⬜ |
| S-34 | falha em qualquer etapa sai ≠ 0 dizendo qual, com cleanup executado | err | e2e | — | B-17 | ⬜ |
| S-35 | atualizar da versão anterior preserva sessões, regras e trilha | est | e2e | — | B-18 | ⬜ |
| S-36 | restaurar backup depois da atualização mantém a coerência | est | e2e | — | B-19 | ⬜ |
| S-37 | rodar `dist:verify` duas vezes seguidas dá o mesmo resultado | idem | e2e | — | B-17 | ⬜ |
| S-38 | sem o Claude instalado na máquina, a instalação falha nomeando o pré-requisito | fron | e2e | — | B-16 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Exposição (B-07…B-11) | `fron` | a fronteira aqui não é numérica, é **binária**: loopback ou não, com TLS ou sem. Os dois lados dela estão em S-13 e S-14 |
| Exposição (B-07…B-11) | `idem` | configuração de exposição não é operação repetível num serviço no ar — o que se repete é o boot, e ele está em S-21 |
| E2E de instalação (B-16…B-19) | `conc` | instalação é operação local e sequencial, uma por máquina. A concorrência que existe no produto instalado está em S-08 e S-22 |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
