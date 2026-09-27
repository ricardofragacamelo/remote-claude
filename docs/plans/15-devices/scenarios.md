# Plano 15 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

Códigos marcados **novo** entram no catálogo em B-04. Os cenários de **regressão do plano 02**
estão marcados *(regressão 02)* — são as garantias que a tela nova não pode perder.

---

## Contrato — B-03, B-04

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | registro **sem** `model`, `osVersion` e `notificationPermission` (app antigo) continua `201`, pendente, igual a hoje | eq | integração | — | B-03 | ⬜ |
| S-02 | `notificationPermission` fora das quatro palavras, ou `model` acima de 100 caracteres | err | integração | `INVALID_INPUT` | B-03 | ⬜ |
| S-03 | os tipos TS e Dart regerados batem com o schema do `device-register` | eq | unit | — | B-03 | ⬜ |
| S-04 | código ou `messageKey` novo sem tradução en e pt-BR → `i18n:check` reprova | err | unit | `DEVICE_NOT_REACHABLE` (novo), `PUSH_PROVIDER_FAILED` (novo) | B-04 | ⬜ |
| S-05 | `DEVICE_NOT_REACHABLE` responde `409` e `PUSH_PROVIDER_FAILED` responde `502` pelo catálogo, nunca `500` | eq | unit | `DEVICE_NOT_REACHABLE`, `PUSH_PROVIDER_FAILED` | B-04 | ⬜ |

## Guarda no banco — B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-06 | o app reabre (`refresh` lido antes) enquanto o aparelho é revogado: termina **revogado** | conc | integração | — | B-05 | ⬜ |
| S-07 | token recusado sendo esquecido enquanto a rotação grava o token novo: o token novo sobrevive | conc | integração | — | B-05 | ⬜ |
| S-08 | token recusado sendo esquecido enquanto o aparelho é revogado: termina revogado, sem token | conc | integração | — | B-05 | ⬜ |
| S-09 | aprovar e revogar concorrentes terminam num estado determinístico **no banco** *(regressão 02 · S-10)* | conc | integração | — | B-05 | ⬜ |
| S-10 | aprovar um revogado é recusado pelo `UPDATE` condicional, não só pela entidade | est | integração | `DEVICE_REVOKED` | B-05 | ⬜ |

## O aparelho se reconhece — B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-11 | nome de exibição é o rótulo quando há, senão o nome informado pelo app | eq | unit | — | B-06 | ⬜ |
| S-12 | o código de verificação é o mesmo para o mesmo `installId` e difere entre dois `installId` do mesmo usuário | eq | unit | — | B-06 | ⬜ |
| S-13 | a migration sobre linhas existentes deixa as colunas novas nulas e nenhum aparelho muda de estado | est | integração | — | B-06 | ⬜ |
| S-14 | o código não é prefixo, sufixo nem trecho do `installId`, e só usa o alfabeto sem ambíguos | fron | unit | — | B-06 | ⬜ |

## Último acesso — B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-15 | handshake de aparelho aprovado atualiza o último acesso | eq | integração | — | B-07 | ⬜ |
| S-16 | dois handshakes dentro da janela de 5 min fazem **uma** escrita; o primeiro depois dela, outra | fron | integração | — | B-07 | ⬜ |
| S-17 | handshake de aparelho revogado fecha `4401` e não toca o último acesso *(regressão 02)* | err | integração | `DEVICE_REVOKED` | B-07 | ⬜ |
| S-18 | dois toques fora de ordem não fazem o último acesso andar para trás | conc | integração | — | B-07 | ⬜ |
| S-19 | "conectado agora" é verdadeiro com o socket aberto e falso depois que a revogação o fecha | est | integração | — | B-07 | ⬜ |
| S-20 | o navegador (sem `installId`) nunca toca aparelho nenhum, e nenhum IP é gravado | eq | integração | — | B-07 | ⬜ |

## Estado do push — B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-21 | entrega `delivered` de um pedido grava instante e desfecho **naquele** aparelho, e só nele | eq | integração | — | B-08 | ⬜ |
| S-22 | `tokenRejected` apaga o token, mantém aprovado e o estado vira "token recusado" *(regressão 02 · D-13)* | est | integração | — | B-08 | ⬜ |
| S-23 | o app informa `denied` → o estado é "notificação desligada no celular", mesmo com token | eq | integração | — | B-08 | ⬜ |
| S-24 | credencial de push ausente → `pushConfigured: false` na lista, e o boot continua *(regressão 02 · D-20)* | fron | integração | — | B-08 | ⬜ |
| S-25 | desfecho que chega depois de o aparelho ser revogado ou apagado não falha nem o ressuscita | conc | unit | — | B-08 | ⬜ |
| S-26 | o desfecho gravado é só enum e instante — nenhum campo da mensagem chega ao aparelho nem ao log | eq | unit | — | B-08 | ⬜ |

## Leitura — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-27 | a lista traz pendentes primeiro, depois por último acesso | eq | integração | — | B-09 | ⬜ |
| S-28 | o pendente traz `pendingExpiresAt` = registro + 7 dias | fron | unit | — | B-09 | ⬜ |
| S-29 | pendente no 8º dia não aparece, mesmo antes da varredura; no 6º aparece *(regressão 02 · S-60)* | fron | integração | — | B-09 | ⬜ |
| S-30 | nenhuma resposta traz o push token nem o `installId` inteiro *(regressão 02)* | eq | integração | — | B-09 | ⬜ |
| S-31 | `GET /devices/:id` de aparelho de outra pessoa responde igual ao inexistente | err | integração | `NOT_FOUND` | B-09 | ⬜ |
| S-32 | aparelho de outra pessoa não aparece na lista, nem com o mesmo `installId` *(regressão 02 · D-10)* | eq | integração | — | B-09 | ⬜ |

## Renomear — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-33 | renomear grava o rótulo e entra na trilha como `device.renamed`, com o anterior e o novo | eq | integração | — | B-10 | ⬜ |
| S-34 | rótulo vazio, só espaços, com 61 caracteres ou com caractere de controle; 60 passa | fron | integração | `INVALID_INPUT` | B-10 | ⬜ |
| S-35 | `label: null` volta ao nome informado pelo app | est | integração | — | B-10 | ⬜ |
| S-36 | o app reabrindo com outro nome não sobrescreve o rótulo | est | integração | — | B-10 | ⬜ |
| S-37 | o mesmo rótulo de novo não grava nem audita | idem | integração | — | B-10 | ⬜ |
| S-38 | renomear pedido por um aparelho (`x-install-id`) | err | integração | `FORBIDDEN` | B-10 | ⬜ |
| S-39 | renomear aparelho de outra pessoa | err | integração | `NOT_FOUND` | B-10 | ⬜ |

## Revogar em lote e recusar — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-40 | revogar três de uma vez: três revogados, três sockets fechados com `4401`, três linhas na trilha *(regressão 02 · B-04)* | eq | integração | — | B-11 | ⬜ |
| S-41 | lote com id de outra pessoa: aquele item `notFound`, os demais revogados | err | integração | `NOT_FOUND` | B-11 | ⬜ |
| S-42 | lote vazio, ou com 51 ids; 50 passa | fron | integração | `INVALID_INPUT` | B-11 | ⬜ |
| S-43 | lote com um já revogado: item `unchanged`, sem linha nova na trilha, socket fechado assim mesmo *(regressão 02 · S-09)* | idem | integração | — | B-11 | ⬜ |
| S-44 | recusar pendente: vira revogado, e o app reabrindo com o mesmo `installId` não volta a pendente | est | integração | — | B-11 | ⬜ |
| S-45 | dois lotes concorrentes com o mesmo aparelho: uma linha de trilha só | conc | integração | — | B-11 | ⬜ |
| S-46 | ids repetidos no mesmo lote são tratados uma vez | idem | unit | — | B-11 | ⬜ |
| S-47 | trilha indisponível no meio do lote: aquele item `failed`, os anteriores revogados e relatados | err | integração | `INTERNAL_ERROR` | B-11 | ⬜ |

## Push de teste — B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-48 | teste para aprovado com token: `200 delivered`, texto no idioma do aparelho, trilha `device.pushTested` | eq | integração | — | B-12 | ⬜ |
| S-49 | o payload do teste não carrega sessão, pedido, comando, arquivo nem output *(regressão 02 · S-19, S-20)* | eq | unit | — | B-12 | ⬜ |
| S-50 | teste para pendente ou revogado | err | integração | `DEVICE_NOT_REACHABLE` (novo, `notApproved`) | B-12 | ⬜ |
| S-51 | teste para aparelho sem token | err | integração | `DEVICE_NOT_REACHABLE` (novo, `noPushToken`) | B-12 | ⬜ |
| S-52 | provedor recusa o token: token apagado, aparelho segue aprovado | err | integração | `DEVICE_NOT_REACHABLE` (novo, `tokenRejected`) | B-12 | ⬜ |
| S-53 | provedor falha ou recusa a mensagem: desfecho gravado | err | integração | `PUSH_PROVIDER_FAILED` (novo) | B-12 | ⬜ |
| S-54 | credencial de push ausente | err | integração | `SERVICE_UNAVAILABLE` | B-12 | ⬜ |
| S-55 | segundo teste do mesmo aparelho dentro de 30 s, com `Retry-After`; aos 30 s passa | fron | integração | `RATE_LIMITED` | B-12 | ⬜ |
| S-56 | dois testes simultâneos do mesmo aparelho: um envio só | conc | integração | `RATE_LIMITED` | B-12 | ⬜ |
| S-57 | o teste usa tag própria: a retirada de um pedido não o apaga, e ele não substitui um pedido na bandeja | conc | unit | — | B-12 | ⬜ |
| S-58 | nome do fornecedor no código novo → `scan:security` reprova *(regressão 02 · S-26)* | err | unit | — | B-12 | ⬜ |

## Histórico do aparelho — B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-59 | resposta a um pedido pelo celular grava o id daquele aparelho na entrada da trilha | eq | integração | — | B-13 | ⬜ |
| S-60 | resposta pelo navegador grava aparelho nulo; entrada `recorded` nunca tem aparelho | eq | integração | — | B-13 | ⬜ |
| S-61 | o histórico lista registrado → aprovado → renomeado → teste → revogado, em ordem | eq | integração | — | B-13 | ⬜ |
| S-62 | respostas paginadas por cursor não pulam nem duplicam sob escrita nova | conc | integração | — | B-13 | ⬜ |
| S-63 | entradas anteriores à coluna não são atribuídas a aparelho nenhum | fron | integração | — | B-13 | ⬜ |
| S-64 | histórico de aparelho de outra pessoa | err | integração | `NOT_FOUND` | B-13 | ⬜ |
| S-65 | cursor malformado, ou `limit` 0 ou 101 | err | integração | `INVALID_INPUT` | B-13 | ⬜ |
| S-66 | pendente que venceu (linha apagada) responde inexistente; os fatos dele continuam na trilha | est | integração | `NOT_FOUND` | B-13 | ⬜ |
| S-67 | com a coluna nova, `UPDATE` em `audit_entries` continua recusado pela trigger | err | integração | — | B-13 | ⬜ |

## Aparelho inativo — B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-68 | aprovado sem acesso há 30 dias e 1 minuto é `inactive`; há 29 dias não; pendente nunca | fron | unit | — | B-14 | ⬜ |
| S-69 | revogação automática ausente da configuração: nada é revogado | eq | integração | — | B-14 | ⬜ |
| S-70 | ligada: revoga o inativo, fecha o socket, trilha com `reason: inactive`; rodar duas vezes não duplica | idem | integração | — | B-14 | ⬜ |
| S-71 | limiar configurado abaixo de 7 dias impede o boot | fron | unit | — | B-14 | ⬜ |

## O app informa — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-72 | o app manda modelo, versão do SO e permissão de notificação no registro e em cada renovação | eq | integração | — | B-15 | ⬜ |
| S-73 | o estado pendente do app mostra o código que o backend devolveu no registro | eq | integração | — | B-15 | ⬜ |
| S-74 | o app recebe o kind `test`: notificação traduzida; o toque abre o app sem deep link de card | eq | integração | — | B-15 | ⬜ |
| S-75 | a permissão do SO muda de concedida para negada → a próxima abertura reporta `denied` | est | integração | — | B-15 | ⬜ |
| S-76 | teste para aparelho cujo `appVersion` é anterior à que reconhece o kind `test`: o backend não envia, e o app antigo nunca recebe payload que não entende | err | integração | `DEVICE_NOT_REACHABLE` (novo, `appTooOld`) | B-15 | ⬜ |

## Rota — B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-77 | `/settings/devices?status=pending&q=pixel&device=<id>` reproduz filtro, busca e painel aberto | eq | integração | — | B-16 | ⬜ |
| S-78 | parâmetro desconhecido ou inválido na URL cai no padrão, sem erro | fron | integração | — | B-16 | ⬜ |
| S-79 | `device` na URL que não existe mais → painel "aparelho não encontrado" com a volta | err | integração | `NOT_FOUND` | B-16 | ⬜ |
| S-80 | a seção Dispositivos das Configurações mostra o resumo e leva à tela | eq | integração | — | B-16 | ⬜ |

## Lista — B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-81 | os quatro estados: skeleton do tamanho das linhas, erro traduzido com tentar de novo, vazio que ensina, lista | eq | integração | — | B-17 | ⬜ |
| S-82 | filtros de estado combinados com busca; sem resultado mostra "limpar filtros" | eq | integração | — | B-17 | ⬜ |
| S-83 | ordenação por nome, último acesso e registro; na padrão, pendentes fixos no topo | eq | integração | — | B-17 | ⬜ |
| S-84 | pendente mostra quanto falta para expirar; no último dia, destaque de urgência | fron | integração | — | B-17 | ⬜ |
| S-85 | abaixo de `md` a lista vira cartões, sem scroll horizontal | fron | integração | — | B-17 | ⬜ |
| S-86 | literal apresentável nos componentes novos → `lint` e `i18n:check` reprovam | err | unit | — | B-17 | ⬜ |

## Detalhe — B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-87 | o painel diz o que o aparelho pode fazer, por estado — pendente, aprovado, revogado | eq | integração | — | B-18 | ⬜ |
| S-88 | o diagnóstico de notificação mostra a causa e o passo seguinte para cada um dos seis casos | eq | integração | — | B-18 | ⬜ |
| S-89 | cada resposta do histórico leva à trilha (a do 12 quando existe, `/audit` filtrado até lá) | eq | integração | — | B-18 | ⬜ |

## Aprovar — B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-90 | aprovar abre o segundo passo com código, alcance e validade; cancelar não aprova | est | integração | — | B-19 | ⬜ |
| S-91 | Enter com o foco inicial do diálogo não aprova | fron | integração | — | B-19 | ⬜ |
| S-92 | pendente que expirou com o diálogo aberto → mensagem traduzida e lista atualizada | err | integração | `NOT_FOUND` | B-19 | ⬜ |
| S-93 | duplo clique em confirmar faz uma chamada só | idem | integração | — | B-19 | ⬜ |

## Revogar — B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-94 | revogar um: confirmação nomeia o aparelho, diz as consequências e o foco vai para "manter" | est | integração | — | B-20 | ⬜ |
| S-95 | seleção por caixa, Shift e Ctrl/Cmd+A; a barra de ações revoga em lote e mostra o resultado por item | eq | integração | — | B-20 | ⬜ |
| S-96 | lote parcialmente falho mostra quais falharam e por quê, sem esconder os que passaram | err | integração | `INTERNAL_ERROR`, `NOT_FOUND` | B-20 | ⬜ |
| S-97 | recusar pendente pede confirmação e explica que reinstalar volta como aparelho novo | est | integração | — | B-20 | ⬜ |

## Teste e renomear — B-21

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-98 | cada desfecho do teste vira mensagem com causa e passo seguinte | err | integração | `DEVICE_NOT_REACHABLE`, `PUSH_PROVIDER_FAILED`, `SERVICE_UNAVAILABLE` | B-21 | ⬜ |
| S-99 | depois do teste o botão mostra quanto falta; um `429` usa o `Retry-After` | fron | integração | `RATE_LIMITED` | B-21 | ⬜ |
| S-100 | renomear inline: Enter salva, Esc cancela, e o desfazer do toast devolve o rótulo anterior | est | integração | — | B-21 | ⬜ |
| S-101 | rótulo inválido é recusado inline antes de enviar; o `400` do servidor também vira mensagem | err | integração | `INVALID_INPUT` | B-21 | ⬜ |

## Atualização viva — B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-102 | aparelho registrado com a tela aberta aparece no ciclo seguinte, com aviso, sem reordenar sob o cursor | conc | integração | — | B-22 | ⬜ |
| S-103 | a atualização para com a aba escondida e volta ao focar | est | integração | — | B-22 | ⬜ |
| S-104 | badge de pendentes e entrada no centro de notificações; somem quando o último é aprovado | est | integração | — | B-22 | ⬜ |
| S-105 | resposta da atualização chegando durante uma ação não desfaz o estado da ação | conc | integração | — | B-22 | ⬜ |

## Usabilidade e ajuda — B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-106 | a gaveta de ajuda existe em en e pt-BR com todas as seções (aprovar, só pelo navegador, código, revogar, 7 dias, inativo, notificação que não chega, o que não é registrado) | eq | integração | — | B-23 | ⬜ |
| S-107 | todo controle de ícone tem tooltip e nome acessível | eq | integração | — | B-23 | ⬜ |
| S-108 | `/`, `F2`, `Delete`, `Enter` e os comandos da palette funcionam e aparecem no editor de atalhos | eq | integração | — | B-23 | ⬜ |
| S-109 | fluxo completo só com teclado; axe sem violação na tela, no painel e nos três diálogos | eq | integração | — | B-23 | ⬜ |
| S-110 | o "saiba mais" de cada erro abre a seção certa da ajuda | eq | integração | — | B-23 | ⬜ |

## E2E — B-24…B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-111 | aprovar pela tela com o segundo passo: o código bate com o do registro, e o aparelho passa a decidir | eq | e2e | — | B-24 | ⬜ |
| S-112 | revogar em lote pela tela fecha os dois sockets com `4401`, e nenhum responde mais pedido *(regressão 02)* | est | e2e | `DEVICE_REVOKED` | B-25 | ⬜ |
| S-113 | aparelho pedindo a aprovação de outro continua recusado *(regressão 02 · D-02)* | err | e2e | `FORBIDDEN` | B-25 | ⬜ |
| S-114 | o push de teste chega ao provedor de teste sem conteúdo e aparece no histórico e na trilha *(regressão 02 · B-12)* | eq | e2e | — | B-26 | ⬜ |
| S-115 | a URL da tela com filtros sobrevive à recarga; no celular, cartões sem scroll horizontal; axe limpo | fron | e2e | — | B-28 | ⬜ |
| S-116 | `test:e2e:mobile`: o app registra com os campos novos, mostra o código, recebe o teste; pendente continua sem decidir *(regressão 02)* | eq | e2e | — | B-27 | ⬜ |
| S-117 | pendente de 8 dias não aparece e não é aprovável pela tela *(regressão 02 · D-11)* | fron | e2e | `NOT_FOUND` | B-28 | ⬜ |
| S-118 | pedido respondido pelo aparelho aparece nas respostas daquele aparelho, com o link para a trilha | eq | e2e | — | B-26 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Contrato (B-03, B-04) | `est`, `conc`, `idem` | é schema e catálogo: não há estado, corrida nem repetição num documento. Registrar de novo — a repetição que importa — já é S-02 do plano 02 e continua valendo |
| O aparelho se reconhece (B-06) | `err`, `conc`, `idem` | o código é função pura (mesma entrada, mesma saída — isso **é** S-12) e as colunas são anuláveis sem regra de recusa; a corrida de escrita é de B-05 |
| Leitura (B-09) | `est`, `conc`, `idem` | leitura não muda estado; leitura sob escrita é a de B-05 e B-13 (S-06…S-09, S-62) |
| Estado do push (B-08) | `err`, `idem` | a porta nunca falha para quem a chama (o push é melhor esforço) — a falha do provedor é S-53; gravar o mesmo desfecho duas vezes é a mesma linha, sem efeito observável |
| Último acesso (B-07) | `idem` | a janela **é** a idempotência (S-16) |
| Aparelho inativo (B-14) | `err`, `conc` | é derivação de instante; a configuração inválida é fronteira de boot (S-71) e a varredura roda sob o mesmo lock da que expira pendentes |
| O app informa (B-15) | `fron`, `conc`, `idem` | reenvio do mesmo registro é idempotente pelo plano 02 (S-02 de lá); não há fronteira nova no que o app manda |
| Rota (B-16) | `est`, `conc`, `idem` | a rota é derivação da URL; aplicar a mesma URL duas vezes é a mesma tela por construção do roteador |
| Lista (B-17) | `est`, `conc`, `idem` | a lista é projeção dos dados; mudança viva é B-22 |
| Detalhe (B-18) | `fron`, `err`, `est`, `conc`, `idem` | o painel só apresenta; os erros de carregar o aparelho e o histórico são S-79 e S-81, e as ações que ele dispara têm cenário nas próprias tasks (B-19…B-21) |
| Aprovar (B-19) | `conc` | a corrida aprovar × revogar é do banco (S-09); na tela, o que conta é o duplo clique (S-93) |
| Revogar (B-20) | `fron`, `conc`, `idem` | o teto do lote e a repetição são do servidor (S-42, S-43, S-46); a tela mostra o resultado que ele devolve |
| Teste e renomear (B-21) | `conc`, `idem` | cooldown e repetição do teste são do servidor (S-55, S-56); renomear igual é S-37 |
| Atualização viva (B-22) | `fron`, `err`, `idem` | falha da atualização reusa o estado de erro da lista (S-81); não há fronteira de volume — um usuário tem poucos aparelhos |
| Usabilidade e ajuda (B-23) | `fron`, `err`, `est`, `conc`, `idem` | é conteúdo, rotulagem e teclado: não há estado nem corrida; o erro de cada ação tem cenário na sua task, e o "saiba mais" de cada um é S-110 |
| E2E (B-24…B-28) | `conc`, `idem` | corridas e repetição são determinísticas e baratas em integração (S-06…S-09, S-43, S-45, S-56, S-93); pela porta do usuário só acrescentariam tempo e instabilidade |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
