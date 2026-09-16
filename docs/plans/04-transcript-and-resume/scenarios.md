# Plano 04 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

---

## Transcript — B-01…B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | a lista traz sessões nossas **e** as criadas no VSCode, com a origem | eq | integração | — | B-02 | ⬜ |
| S-02 | mensagem histórica chega no mesmo formato do evento vivo | eq | unit | — | B-03 | ⬜ |
| S-03 | sessão sem mensagem devolve lista vazia, não erro | fron | integração | — | B-02 | ⬜ |
| S-04 | transcript de outro dono | err | integração | `NOT_FOUND` | B-04 | ⬜ |
| S-05 | SDK indisponível ao ler o histórico | err | integração | `CLAUDE_UNAVAILABLE` | B-05 | ⬜ |
| S-06 | transcript longo é paginado, e a página seguinte continua de onde parou | fron | integração | — | B-04 | ⬜ |
| S-07 | a mesma página pedida duas vezes devolve o mesmo conteúdo | idem | integração | — | B-04 | ⬜ |
| S-08 | ler enquanto a sessão viva grava não corrompe a página | conc | integração | — | B-04 | ⬜ |
| S-09 | parser próprio de JSONL → `lint:arch` reprova | err | unit | — | B-01 | ⬜ |
| S-10 | sessão que termina durante a leitura fecha a página sem erro | est | integração | — | B-01 | ⬜ |
| S-54 | sessão sem `cwd` é excluída da lista — não há como provar que é de workspace liberado | fron | integração | — | B-02 | ⬜ |
| S-55 | sessão de worktree cujo `cwd` está fora da allowlist não aparece | err | integração | — | B-04 | ⬜ |
| S-56 | sessão inexistente distingue-se de sessão vazia — `getSessionInfo` decide | err | integração | `NOT_FOUND` | B-04 | ⬜ |
| S-57 | duas páginas pedidas sob escrita viva não pulam nem duplicam mensagem | conc | integração | — | B-04 | ⬜ |
| S-64 | o cache do transcript é invalidado quando o `lastModified` muda | idem | integração | — | B-04 | ⬜ |

## Telas de histórico — B-06…B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-11 | a lista mostra a origem (VSCode ou remoto) de cada sessão | eq | integração | — | B-06 | ⬜ |
| S-12 | filtro por workspace devolve só as sessões daquele workspace | eq | integração | — | B-06 | ⬜ |
| S-13 | sem nenhuma sessão, a tela mostra o estado vazio | fron | integração | — | B-06 | ⬜ |
| S-14 | `gap: true` limpa o store e recarrega o transcript por HTTP | est | integração | — | B-07 | ⬜ |
| S-15 | recarregar com o stream vivo chegando **não** duplica mensagem | conc | integração | — | B-07 | ⬜ |
| S-16 | abrir o mesmo transcript duas vezes usa cache, sem refazer a chamada | idem | integração | — | B-07 | ⬜ |
| S-17 | falha ao carregar mostra erro traduzido, com ação de recuperação | err | integração | `CLAUDE_UNAVAILABLE` | B-08 | ⬜ |
| S-18 | literal apresentável nas telas novas → `lint` e `i18n:check` falham | err | unit | — | B-09 | ⬜ |

## Retomada — B-10…B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-19 | retomar sessão encerrada continua a conversa com o contexto anterior | eq | integração | — | B-10 | ⬜ |
| S-20 | retomar sessão criada no VSCode funciona | eq | integração | — | B-12 | ⬜ |
| S-21 | `seq` recomeça na sessão retomada, sem misturar com o histórico | est | integração | — | B-11 | ⬜ |
| S-22 | retomar sessão inexistente | err | unit | `SESSION_NOT_FOUND` | B-13 | ⬜ |
| S-23 | retomar sessão cujo workspace saiu da allowlist | err | integração | `WORKSPACE_NOT_ALLOWED` | B-13 | ⬜ |
| S-24 | retomar sessão **que já está viva** vira `attach`, não um segundo `start` | idem | integração | — | B-13 | ⬜ |
| S-25 | dois clientes retomam ao mesmo tempo → uma única `query()` | conc | integração | — | B-13 | ⬜ |
| S-26 | retomar acima do limite de sessões simultâneas | fron | integração | `SESSION_LIMIT_REACHED` | B-13 | ⬜ |
| S-27 | a retomada entra em `audit` | eq | integração | — | B-10 | ⬜ |
| S-28 | nenhuma mensagem de transcript é copiada para o Postgres → `lint:arch` reprova | err | unit | — | B-11 | ⬜ |
| S-58 | retomar sessão **externa** cria `sessionId` novo e não escreve no transcript de origem | est | integração | — | B-12 | ⬜ |
| S-59 | retomar sessão **nossa** mantém o mesmo `sessionId` e preserva o histórico de undo | est | integração | — | B-10 | ⬜ |

## Slash commands — B-14…B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-29 | a lista vem de `supportedCommands()`, sem constante no código | eq | integração | — | B-14 | ⬜ |
| S-30 | instalação com menos comandos reflete na UI | eq | integração | — | B-15 | ⬜ |
| S-31 | lista indisponível → a caixa de prompt continua utilizável | err | integração | — | B-15 | ⬜ |
| S-32 | `/init` dispara o comando e termina em sucesso | eq | integração | — | B-16 | ⬜ |
| S-33 | `/init` pede autorização de `Write` pelo fluxo normal de permissão | est | integração | — | B-16 | ⬜ |
| S-34 | comando inexistente digitado pelo usuário → erro traduzido | err | integração | `INVALID_INPUT` | B-15 | ⬜ |
| S-35 | a lista é cacheada e invalidada quando a versão do CLI muda | idem | integração | — | B-17 | ⬜ |
| S-36 | duas sessões pedindo a lista ao mesmo tempo fazem **uma** chamada | conc | integração | — | B-17 | ⬜ |
| S-60 | comando interno (`__`) ou morto (`(removed)`, `Renamed to`) não aparece no menu | eq | integração | — | B-15 | ⬜ |

## Desfazer — B-18…B-21

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-37 | desfazer devolve os arquivos ao ponto escolhido | eq | integração | — | B-18 | ⬜ |
| S-38 | a confirmação mostra **quais** arquivos voltam e para qual ponto | est | integração | — | B-19 | ⬜ |
| S-39 | desfazer em sessão fechada | err | unit | `SESSION_NOT_FOUND` | B-21 | ⬜ |
| S-40 | desfazer não alcança arquivo que aquela sessão não tocou | fron | integração | — | B-21 | ⬜ |
| S-41 | desfazer duas vezes para o mesmo ponto é idempotente | idem | integração | — | B-21 | ⬜ |
| S-42 | o desfazer entra em `audit`, com a lista de arquivos | eq | integração | — | B-20 | ⬜ |
| S-43 | desfazer com um turno em execução é recusado | conc | integração | `SESSION_LOCKED` | B-21 | ⬜ |
| S-44 | falha no meio do rewind informa o que foi e o que não foi revertido | err | integração | `INTERNAL_ERROR` | B-21 | ⬜ |
| S-45 | o comando de rewind existe nas três pontas → `contracts:check` verde | eq | unit | — | B-18 | ⬜ |
| S-61 | alvo de rewind que não é checkpoint nosso é recusado | err | unit | `INVALID_INPUT` | B-21 | ⬜ |
| S-62 | falha no meio da restauração informa o que voltou e o que não voltou | err | integração | `INTERNAL_ERROR` | B-21 | ⬜ |
| S-63 | arquivo alterado fora da sessão é **preservado**, e os demais revertem | est | integração | — | B-21 | ⬜ |
| S-65 | caminho que virou symlink, hard link ou arquivo não regular é recusado, não restaurado | err | integração | — | B-21 | ⬜ |
| S-66 | restauração é atômica: falha na escrita não deixa arquivo truncado | err | integração | — | B-21 | ⬜ |
| S-67 | store de snapshots respeita o teto, e a purga não apaga o que uma sessão viva ainda alcança | fron | integração | — | B-21 | ⬜ |

## E2E — B-22…B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-46 | retomar uma sessão encerrada e continuar a conversa | eq | e2e | — | B-23 | ⬜ |
| S-47 | `gap: true` → recarrega o transcript por HTTP e a tela volta coerente | est | e2e | — | B-23 | ⬜ |
| S-48 | abrir no celular a sessão que começou no navegador | eq | e2e | — | B-22 | ⬜ |
| S-49 | `/init` pelo menu pede `Write` e escreve o arquivo | est | e2e | — | B-25 | ⬜ |
| S-50 | desfazer pela UI devolve o arquivo ao estado anterior | eq | e2e | — | B-24 | ⬜ |
| S-51 | desfazer durante um turno em execução é recusado, com explicação | conc | e2e | `SESSION_LOCKED` | B-24 | ⬜ |
| S-52 | `smoke-live`: `supportedCommands()` real e `/init` terminando em sucesso | eq | e2e | — | B-25 | ⬜ |
| S-53 | retomar sessão cujo workspace foi removido mostra erro traduzido | err | e2e | `WORKSPACE_NOT_ALLOWED` | B-23 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| E2E (B-22…B-25) | `fron` | as fronteiras deste plano são de paginação e de limite de sessão, exatas e baratas em integração (S-06, S-26). Em e2e custariam minutos para provar o mesmo |
| E2E (B-22…B-25) | `idem` | a repetição que importa — mesma página, mesmo rewind, retomar sessão viva — é determinística e está em S-07, S-24 e S-41; pela porta do usuário ela só acrescenta tempo de execução |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
