# Plano 06 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

Códigos **novos** deste plano, acrescentados ao catálogo pela [B-03](F0-contract.md#b-03--backend03-04-errors-and-http-e-o-catálogo-listar-pasta-passa-a-existir-):
`WORKSPACE_DIRECTORY_UNREADABLE` (422) e `OPEN_FOLDERS_LIMIT_REACHED` (409). Os demais são do
[catálogo existente](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio);
`NETWORK_UNREACHABLE` é código que só o cliente gera.

---

## Contrato, documentos e rotas — B-01…B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | código novo sem `messageKey` em `en` **e** `pt-BR` → `i18n:check` reprova | err | unit | — | B-03 | ✅ |
| S-02 | DTO de `GET /workspaces/directories`: `path` ausente, vazio, relativo, com `..` ou NUL → recusado antes do caso de uso | err | unit | `INVALID_INPUT` | B-04 | ✅ |
| S-03 | `/workbench` sem `folder` cai na boas-vindas, não num erro — movido da F0 ([D-18](decisions.md#d-18--os-cenários-de-rota-que-dependem-de-produto)): a rota nasce com a pasta na URL | fron | unit | — | B-16 | ⬜ |
| S-04 | `folder` com espaço, acento, `#`, `%`, `?` e `&` faz ida e volta pela URL sem perda | fron | unit | — | B-05 | ✅ |
| S-05 | `/` com abas abertas vai para a ativa; sem abas mostra a boas-vindas — movido da F0 ([D-18](decisions.md#d-18--os-cenários-de-rota-que-dependem-de-produto)): as abas nascem na B-20 | est | integração | — | B-20 | ⬜ |
| S-06 | as rotas de hoje que ficam (`/audit?…`, `/rules`, `/rules/$ruleId`, callback) continuam resolvendo, com a search preservada. A metade das removidas pela D-07 foi para o S-150, com a remoção ([D-18](decisions.md#d-18--os-cenários-de-rota-que-dependem-de-produto)) | eq | unit | — | B-05 | ✅ |
| S-07 | rota reservada a outro plano (`/claude…`) não renderiza link nem tela vazia enquanto ninguém a registra — cai no "não encontrado" traduzido | fron | unit | `NOT_FOUND` | B-05 | ✅ |
| S-164 | documento normativo novo fora de todo índice, ou link para âncora que não existe → `docs:check` reprova | err | unit | — | B-02 | ✅ |
| S-165 | a ADR-014 existe com a alternativa descartada e as decisões D-01, D-08 e D-10 com resultado, e os documentos do web e do backend apontam para ela | eq | unit | — | B-01 | ✅ |

## Listagem de subpastas — B-06…B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-08 | lista só diretórios, um nível, em ordem estável, sem distinção de caixa e com números em ordem natural (`dir2` antes de `dir10`) | eq | unit | — | B-06 |✅ |
| S-09 | arquivo, socket, fifo e dispositivo ficam fora da lista | eq | unit | — | B-06 |✅ |
| S-10 | pasta sem subpastas → `entries: []`, `truncated: false` | fron | integração | — | B-08 |✅ |
| S-11 | exatamente o teto → `truncated: false`; teto + 1 → teto entradas e `truncated: true` | fron | unit | — | B-06 |✅ |
| S-12 | o adapter para de ler em teto + 1 — um diretório com dezenas de milhares de entradas custa o mesmo que um com teto + 1 | fron | integração | — | B-07 |✅ |
| S-13 | o filtro por prefixo alcança a entrada que o teto cortou | fron | integração | — | B-06 |✅ |
| S-14 | nome começado por `.` vem com `hidden: true` e só aparece quando `hidden=true` é pedido | eq | unit | — | B-06 |✅ |
| S-15 | symlink para diretório dentro da mesma raiz é listado com `symlink: true` e é navegável | eq | integração | — | B-07 |✅ |
| S-16 | symlink cujo alvo está fora da raiz é **omitido** — listá-lo diria o que existe fora da fronteira | fron | integração | — | B-06 |✅ |
| S-17 | symlink quebrado e symlink em ciclo (`a → b → a`) são omitidos, sem travar | fron | integração | — | B-07 |✅ |
| S-18 | na própria raiz, `parent` é `null` — nunca se lista acima dela | fron | integração | — | B-08 |✅ |
| S-19 | nome com espaço, acento, emoji e quebra de linha volta intacto e é navegável | fron | integração | — | B-07 |✅ |
| S-20 | `path` fora de toda raiz | err | integração | `WORKSPACE_NOT_ALLOWED` | B-08 |✅ |
| S-21 | `path` dentro de uma raiz que existe e é de outra pessoa | err | integração | `FORBIDDEN` | B-08 |✅ |
| S-22 | `path` inexistente | err | integração | `WORKSPACE_NOT_FOUND` | B-08 |✅ |
| S-23 | `path` que é arquivo | err | integração | `WORKSPACE_NOT_A_DIRECTORY` | B-08 |✅ |
| S-24 | `path` que é um symlink para fora da raiz é recusado pela contenção no realpath | err | integração | `WORKSPACE_NOT_ALLOWED` | B-08 |✅ |
| S-25 | diretório que o processo do backend não pode ler | err | integração | `WORKSPACE_DIRECTORY_UNREADABLE` (novo, B-03) | B-07 |✅ |
| S-26 | subpasta ilegível dentro de pasta legível **aparece** na lista; a recusa vem ao entrar nela (S-25) | eq | integração | — | B-07 |✅ |
| S-27 | sem token | err | integração | `UNAUTHENTICATED` | B-08 |✅ |
| S-28 | entrada que some entre a leitura e o `realpath` é omitida, e a resposta sai `200` | conc | integração | — | B-07 |✅ |
| S-29 | subpastas criadas e removidas durante a listagem não a derrubam nem duplicam entrada | conc | integração | — | B-07 |✅ |
| S-30 | a mesma listagem duas vezes, sem mudança no disco, devolve o mesmo conteúdo na mesma ordem | idem | integração | — | B-08 |✅ |
| S-31 | o log `debug` da borda traz caminho, contagem, `truncated` e duração — e nenhum nome de entrada | eq | integração | — | B-07 |✅ |
| S-32 | allowlist recarregada sem a raiz: a listagem seguinte já recusa — a lista é lida a cada uso | est | integração | `WORKSPACE_NOT_ALLOWED` | B-08 |✅ |
| S-33 | o comentário do controller que dizia "neither walks the disk" foi corrigido — revisão de doc; `docs:check` verde | eq | unit | — | B-08 |✅ |

## Recentes e pastas abertas — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-34 | abrir uma pasta grava o recente; a lista vem por `last_opened_at` desc, só do usuário | eq | integração | — | B-09 |✅ |
| S-35 | abrir a mesma pasta de novo atualiza a data sem duplicar | idem | integração | — | B-09 |✅ |
| S-36 | recente de outro usuário nunca aparece | eq | integração | — | B-09 |✅ |
| S-37 | recente cuja pasta saiu da allowlist ou sumiu vem `available: false`, sem quebrar a lista | est | integração | — | B-09 |✅ |
| S-38 | acima do teto de recentes, o mais antigo **não fixado** sai; fixado nunca sai pelo teto | fron | integração | — | B-09 |✅ |
| S-39 | fixar e desafixar um recente; fixar o que já está fixado não muda nada | idem | integração | — | B-09 |✅ |
| S-40 | remover um recente o tira da lista; remover o que não existe responde `204` | idem | integração | — | B-09 |✅ |
| S-41 | abrir uma pasta já aberta devolve a existente (`200`, não `201`) e não duplica | idem | integração | — | B-09 |✅ |
| S-42 | fechar uma pasta que não está aberta responde `204` | idem | integração | — | B-09 |✅ |
| S-43 | abrir acima do teto de abas | err | integração | `OPEN_FOLDERS_LIMIT_REACHED` (novo, B-03) | B-09 |✅ |
| S-44 | reordenar com um conjunto diferente do aberto | err | integração | `CONFLICT` | B-09 |✅ |
| S-45 | abrir pasta fora da allowlist → recusado, e **nada** é gravado (nem recente, nem aba) | err | integração | `WORKSPACE_NOT_ALLOWED` | B-09 |✅ |
| S-46 | duas aberturas simultâneas da mesma pasta resultam numa linha só | conc | integração | — | B-09 |✅ |
| S-47 | aba aberta cuja pasta saiu da allowlist volta em `GET /workspaces/open-folders` com `state: notAllowed`, e a que sumiu com `missing` — as outras seguem `available` | est | integração | — | B-09 |✅ |
| S-48 | falha do banco ao gravar a abertura → a abertura não finge sucesso | err | integração | `INTERNAL_ERROR` | B-09 |✅ |
| S-49 | fechar a pasta não encerra sessão viva do Claude nela — o módulo `workspace` nem conhece sessão | est | integração | — | B-09 |✅ |

## Raízes locais de desenvolvimento — B-10, B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-50 | `pnpm allowlist add <path>` cria a cópia local a partir do default (a Scratch continua) e acrescenta a raiz com os usuários do realm de dev | eq | integração | — | B-10 |✅ |
| S-51 | `add` do mesmo caminho duas vezes não duplica a raiz | idem | integração | — | B-10 |✅ |
| S-52 | `~` é expandido, relativo é resolvido contra o diretório corrente, e o caminho absoluto gravado é mostrado | eq | unit | — | B-10 |✅ |
| S-53 | caminho inexistente, arquivo ou `/` → recusa com mensagem, saída ≠ 0, cópia intocada | err | integração | — | B-10 |✅ |
| S-54 | `$HOME` pede confirmação dizendo o alcance por extenso; sem confirmar, nada muda | fron | integração | — | B-10 |✅ |
| S-55 | `remove` de raiz que não está na cópia sai 0 sem mudar nada | idem | integração | — | B-10 |✅ |
| S-56 | a cópia local está no `.gitignore`: `git status` continua limpo depois de `add` | eq | integração | — | B-10 |✅ |
| S-57 | cópia local editada à mão fora do schema → o boot cai listando cada problema, como o default | err | integração | — | B-10 |✅ |
| S-58 | o script e o boot validam pelo **mesmo** schema — um caso inválido para um é inválido para o outro | eq | unit | — | B-10 |✅ |
| S-59 | a stack de e2e e a de teste ignoram a cópia local | eq | integração | — | B-10 |✅ |
| S-60 | dois `add` simultâneos não corrompem o arquivo (temporário + `rename`) e nenhum se perde | conc | integração | — | B-10 |✅ |
| S-61 | `pnpm doctor` e o log de boot dizem qual arquivo de allowlist está ativo | eq | integração | — | B-10 |✅ |
| S-62 | depois do `SIGHUP` (D-15), o backend em execução já lista e abre a raiz nova, sem reiniciar | est | integração | — | B-11 |✅ |
| S-63 | recarga com arquivo inválido mantém a lista anterior e loga o erro | err | integração | — | B-11 |✅ |
| S-64 | recarga que remove uma raiz não mexe nas sessões vivas nela; a próxima abertura já recusa | est | integração | `WORKSPACE_NOT_ALLOWED` | B-11 |✅ |
| S-179 | `pnpm allowlist add` sem backend do `pnpm dev` em execução grava a cópia, sai 0 e diz como recarregar; salvar o arquivo sem mandar o sinal **não** muda a lista em uso — não há watch | est | integração | — | B-11 |✅ |
| S-180 | `SIGHUP` com o handler registrado não derruba o processo: a conexão WebSocket aberta e a sessão viva continuam, e o sinal chega ao processo do app, não ao `nest --watch` | est | integração | — | B-11 |✅ |

## Sobre — B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-65 | `GET` das versões devolve backend, SDK do Claude, CLI do Claude e Node | eq | integração | — | B-12 |✅ |
| S-66 | CLI do Claude ausente ou sem resposta → campo `null` com o motivo, e a resposta sai `200` | fron | integração | — | B-12 |✅ |
| S-67 | sem token | err | integração | `UNAUTHENTICATED` | B-12 |✅ |
| S-68 | pedido repetido não sobe o CLI de novo — a versão vem do cache por versão já existente | idem | integração | — | B-12 |✅ |

## Histórico de notificações — B-40

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-167 | gravar uma notificação e listar: só as do usuário, mais nova primeiro, com a contagem de não lidas | eq | integração | — | B-40 |✅ |
| S-168 | notificação de outro usuário nunca aparece, nem marcá-la como lida ou apagá-la tem efeito sobre ela | eq | integração | — | B-40 |✅ |
| S-169 | gravar de novo com o mesmo `clientId` devolve a existente (`200`, não `201`) e não duplica | idem | integração | — | B-40 |✅ |
| S-170 | a 201ª notificação tira a mais antiga: o usuário nunca passa de 200 | fron | integração | — | B-40 |✅ |
| S-171 | a limpeza apaga a de 30 dias e 1 segundo e mantém a de 30 dias menos 1 segundo | fron | integração | — | B-40 |✅ |
| S-172 | marcar como lida duas vezes, marcar id que não existe e "marcar todas" repetido respondem `204` sem mudar o que já estava | idem | integração | — | B-40 |✅ |
| S-173 | lida num dispositivo volta lida na listagem do outro, e a contagem de não lidas cai nos dois | est | integração | — | B-40 |✅ |
| S-174 | `messageKey` fora do catálogo de chaves, `severity` desconhecida ou `params` fora do schema → recusado, nada gravado | err | integração | `INVALID_INPUT` | B-40 |✅ |
| S-175 | sem token | err | integração | `UNAUTHENTICATED` | B-40 |✅ |
| S-176 | gravações simultâneas com o usuário no teto não deixam 201 linhas | conc | integração | — | B-40 |✅ |
| S-177 | apagar uma e "limpar todas" respondem `204`, também quando não há o que apagar | idem | integração | — | B-40 |✅ |
| S-178 | o log `debug` da borda traz severidade, `messageKey` e contagem — nunca os `params` | eq | integração | — | B-40 |✅ |

## Abrir pasta (web) — B-13…B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-69 | a boas-vindas mostra Abrir pasta, Recentes (fixados primeiro, indisponível marcado com o motivo) e as raízes | eq | integração | — | B-14 | ⬜ |
| S-70 | fixar, desafixar e remover recente pela boas-vindas, também pelo menu de contexto e pelo teclado | eq | integração | — | B-14 | ⬜ |
| S-71 | sem recentes → estado vazio que ensina o próximo passo; com só a raiz de scratch, mostra o comando `pnpm allowlist add` copiável | fron | integração | — | B-14 | ⬜ |
| S-72 | diálogo: raízes no topo; entrar numa subpasta atualiza o breadcrumb; o breadcrumb nunca sobe acima da raiz | eq | integração | — | B-15 | ⬜ |
| S-73 | teclado no diálogo: setas, `Enter` entra, `Backspace`/`Alt+↑` sobe, digitar filtra, `Esc` fecha e devolve o foco | eq | integração | — | B-15 | ⬜ |
| S-74 | "mostrar ocultas" refaz a listagem com `hidden=true` | eq | integração | — | B-15 | ⬜ |
| S-75 | `truncated: true` mostra o aviso e o filtro por prefixo vai ao servidor | fron | integração | — | B-15 | ⬜ |
| S-76 | os quatro estados do diálogo: skeleton, erro traduzido com "tentar de novo", vazio que explica, conteúdo | est | integração | `WORKSPACE_DIRECTORY_UNREADABLE` | B-15 | ⬜ |
| S-77 | cliques seguidos em pastas diferentes: a tela mostra só a listagem do último pedido | conc | integração | — | B-13 | ⬜ |
| S-78 | "Abrir" navega para `/workbench?folder=<caminho real>` — o link do symlink vira o caminho resolvido | eq | integração | — | B-16 | ⬜ |
| S-79 | `folder` fora da allowlist → erro traduzido com caminho de volta (boas-vindas, Abrir outra pasta) | err | integração | `WORKSPACE_NOT_ALLOWED` | B-16 | ⬜ |
| S-80 | `folder` inexistente | err | integração | `WORKSPACE_NOT_FOUND` | B-16 | ⬜ |
| S-81 | `folder` que é arquivo | err | integração | `WORKSPACE_NOT_A_DIRECTORY` | B-16 | ⬜ |
| S-82 | a sessão iniciada no workbench nasce com `workspacePath` = pasta da URL — nunca a primeira raiz por default (o caso relatado) | eq | integração | — | B-16 | ⬜ |
| S-83 | recarregar `/workbench?folder=` reabre a mesma pasta, sem duplicar o recente | idem | integração | — | B-16 | ⬜ |
| S-84 | literal apresentável nas telas novas → `lint` e `i18n:check` reprovam | err | unit | — | B-14 | ⬜ |
| S-85 | axe sem violação na boas-vindas e no diálogo | eq | integração | — | B-15 | ⬜ |

## Sistema visual, moldura e moldura de tela — B-17…B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-86 | tema escuro por default com `prefers-color-scheme: dark`; a escolha salva vence; `localStorage` que lança cai no default sem erro | est | unit | — | B-17 | ⬜ |
| S-87 | cor literal em classe de componente de feature, ou ícone fora do `lucide-react` → lint reprova | err | unit | — | B-17 | ⬜ |
| S-88 | toda variável de tema existe nos temas claro **e** escuro — variável faltando num deles reprova o teste de tokens | err | unit | — | B-17 | ⬜ |
| S-89 | a navegação global lista, em ordem, só as entradas registradas: Workbench, Auditoria, Regras, Dispositivos, Logs e diagnóstico, Configurações — e as dos planos 11 e 14 quando eles as registram | eq | unit | — | B-18 | ⬜ |
| S-90 | o item ativo segue a rota, inclusive por deep link (`/audit?…`, `/rules/$ruleId`) | eq | integração | — | B-18 | ⬜ |
| S-91 | abrir um deep link deslogado leva ao login e volta à mesma rota **com** a search | est | integração | `UNAUTHENTICATED` | B-18 | ⬜ |
| S-92 | abaixo de `md` a navegação vira menu com foco preso; `Esc` fecha e devolve o foco | fron | integração | — | B-18 | ⬜ |
| S-93 | a moldura de tela mostra título, propósito e o botão de ajuda; o painel de ajuda traz "o que é", "o que cada estado significa", "o que não é registrado" e os atalhos da tela | eq | integração | — | B-19 | ⬜ |
| S-94 | tela que usa a moldura sem chave de ajuda em `en` ou `pt-BR` → `i18n:check` reprova | err | unit | — | B-19 | ⬜ |
| S-95 | abrir a ajuda duas vezes não empilha dois painéis; o estado aberto/fechado é lembrado por visitante | idem | integração | — | B-19 | ⬜ |

## Abas de pasta — B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-96 | abrir uma segunda pasta cria uma segunda aba e a ativa; a URL passa a ter o `folder` dela | eq | integração | — | B-20 | ⬜ |
| S-97 | abrir uma pasta já aberta foca a aba existente, sem duplicar | idem | integração | — | B-20 | ⬜ |
| S-98 | pasta e subpasta abertas são abas distintas — sem dedupe por prefixo | fron | integração | — | B-20 | ⬜ |
| S-99 | **vazamento entre abas**: view ativa, seleção, rascunho e tamanhos de uma aba não aparecem em outra — store por pasta, nunca global | eq | integração | — | B-20 | ⬜ |
| S-100 | alternar A → B → A preserva o estado de A | est | integração | — | B-20 | ⬜ |
| S-101 | fechar uma aba não encerra as sessões do Claude daquela pasta, e a confirmação diz isso | est | integração | — | B-20 | ⬜ |
| S-102 | fechar a aba ativa ativa a vizinha (direita, senão esquerda); fechar a última volta à boas-vindas | fron | integração | — | B-20 | ⬜ |
| S-103 | URL com uma pasta que não está entre as abertas a abre como aba nova | eq | integração | — | B-20 | ⬜ |
| S-104 | aba cuja pasta saiu da allowlist ou sumiu abre em estado de erro; as outras seguem funcionando | err | integração | `WORKSPACE_NOT_ALLOWED`, `WORKSPACE_NOT_FOUND` | B-20 | ⬜ |
| S-105 | abrir além do teto → recusa traduzida que diz o teto | err | integração | `OPEN_FOLDERS_LIMIT_REACHED` | B-20 | ⬜ |
| S-106 | arrastar para reordenar, e a alternativa por teclado e por menu ("mover para a esquerda/direita"); a ordem sobrevive à recarga | eq | integração | — | B-20 | ⬜ |
| S-107 | duas janelas do navegador abrindo e fechando abas convergem para o mesmo conjunto guardado no servidor (D-10): a janela relê o conjunto ao ganhar foco e ao reconectar | conc | integração | — | B-20 | ⬜ |
| S-108 | aba inativa desmonta a árvore e libera o watcher, mantendo o store; ao reativar, recarrega sem perder o estado da aba (D-11) | est | integração | — | B-20 | ⬜ |
| S-181 | sessão viva de uma aba inativa continua anexada: o pedido de permissão e o stream chegam sem reanexar, e ao voltar não há replay | est | integração | — | B-20 | ⬜ |
| S-109 | clique duplo em fechar fecha uma aba só | idem | integração | — | B-20 | ⬜ |
| S-110 | em tela pequena as abas viram um seletor com as mesmas ações | fron | integração | — | B-20 | ⬜ |

## Casca do workbench — B-21, B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-111 | a activity bar alterna as views da side bar; clicar na view ativa recolhe a side bar | est | integração | — | B-21 | ⬜ |
| S-112 | view registrada por outro plano (Explorer do 07, Busca do 09, Sessões do 08) aparece na activity bar na posição declarada; sem registro, o placeholder com estado vazio traduzido | eq | unit | — | B-21 | ⬜ |
| S-113 | redimensionar respeita mínimos e máximos; tamanhos salvos por visitante; `localStorage` que lança → defaults, sem erro | fron | unit | — | B-21 | ⬜ |
| S-114 | a status bar mostra conexão (e muda quando o socket cai e volta), pasta, idioma, tema e o sino de notificações | est | integração | — | B-21 | ⬜ |
| S-115 | até o plano 08, a secondary side bar mostra a sessão da pasta com os componentes de hoje (conversa, tools, composer) — iniciar, conversar e aprovar sem sair da aba; nada regride | eq | integração | — | B-21 | ⬜ |
| S-116 | em `md+`, explorer, área de editor e chat do Claude ficam **lado a lado, ao mesmo tempo, na mesma aba de pasta**; nenhuma rota leva ao chat fora da aba | eq | integração | — | B-21 | ⬜ |
| S-117 | abaixo de `md`: uma view por vez — Explorer, Editor, Claude, Painel — trocadas **dentro da mesma aba de pasta**, barra de views embaixo, sem scroll horizontal em 360 px, alvos de 44×44 px | fron | integração | — | B-22 | ⬜ |
| S-118 | mudar a largura da janela entre os dois layouts não perde o estado da aba | est | integração | — | B-22 | ⬜ |

## Comandos, menu Arquivo, notificações e restauração — B-23…B-27

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-119 | comando com id duplicado, ou atalho em conflito no mesmo contexto, é recusado no registro | err | unit | — | B-23 | ⬜ |
| S-120 | atalho da casca dentro de campo de texto não dispara — exceto o da paleta | fron | unit | — | B-23 | ⬜ |
| S-121 | comando indisponível no contexto (condição falsa) não executa pelo atalho | eq | unit | — | B-23 | ⬜ |
| S-122 | os atalhos de troca de aba (D-16) funcionam num navegador comum, sem depender de tecla reservada | eq | integração | — | B-23 | ⬜ |
| S-123 | `Ctrl/Cmd+Shift+P` abre a paleta; filtra por rótulo traduzido e por categoria, mostra o atalho, executa e fecha; os comandos de arquivo (abrir pasta, abrir recente, fechar aba de pasta) estão lá desde este plano | eq | integração | — | B-24 | ⬜ |
| S-124 | prefixo muda o modo (`>` comandos); modo registrado por outro plano (Quick Open do 09) aparece sem mudar a paleta | eq | unit | — | B-24 | ⬜ |
| S-125 | abrir a paleta com ela aberta não abre outra; `Esc` fecha e devolve o foco a quem o tinha | idem | integração | — | B-24 | ⬜ |
| S-126 | comando que lança erro ao executar vira notificação traduzida, e a paleta fecha sem travar | err | integração | — | B-24 | ⬜ |
| S-127 | o menu **Arquivo** sai do registro, com grupos na ordem do VS Code (novo arquivo, nova pasta · abrir pasta, abrir recente · salvar, salvar tudo · fechar editor, fechar aba de pasta): rótulo, atalho e disponibilidade iguais aos da paleta | eq | integração | — | B-25 | ⬜ |
| S-128 | item cujo comando ainda não foi registrado (novo arquivo, salvar — plano 07) não aparece; aparece quando o plano o registra | fron | unit | — | B-25 | ⬜ |
| S-129 | o menu Arquivo é navegável por teclado (padrão ARIA menubar) e, abaixo de `md`, mora no menu da navegação | fron | integração | — | B-25 | ⬜ |
| S-130 | notificação vira toast com severidade e ação; some sozinha quando informativa, fica quando pede ação | eq | integração | — | B-26 | ⬜ |
| S-131 | o centro de notificações lê o histórico do servidor (B-40) e o reencontra depois de recarregar; limpar uma, limpar todas, marcar como lida; "não perturbe", por visitante, silencia toasts sem perder o histórico | est | integração | — | B-26 | ⬜ |
| S-132 | rajada de notificações iguais é agrupada com contador antes de ir ao servidor — uma gravação, não uma por repetição | conc | unit | — | B-26 | ⬜ |
| S-182 | falha ao gravar a notificação no servidor não perde o toast nem o item no centro; o reenvio usa o mesmo `clientId` e não duplica | err | integração | `NETWORK_UNREACHABLE` | B-26 | ⬜ |
| S-133 | toast é anunciado ao leitor de tela (`role="status"`/`alert` por severidade) e não rouba o foco | eq | integração | — | B-26 | ⬜ |
| S-134 | recarregar restaura, por aba, a view ativa, o layout e o painel; editores abertos voltam pelo gancho que o plano 07 registra | est | integração | — | B-27 | ⬜ |
| S-135 | estado restaurado de uma pasta que não está mais aberta é descartado; estado corrompido cai no default sem erro | err | unit | — | B-27 | ⬜ |

## Telas separadas — B-28…B-34

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-136 | Auditoria abre na sua própria tela com o conteúdo de hoje; `/audit?…` filtrado continua sendo um link | eq | integração | — | B-28 | ⬜ |
| S-137 | Regras abre na sua própria tela; `/rules/$ruleId` abre a regra, em qualquer estado | eq | integração | — | B-28 | ⬜ |
| S-138 | Dispositivos é uma tela própria (não uma seção de Configurações), com a lista de hoje: aprovar e revogar funcionam igual | eq | integração | — | B-29 | ⬜ |
| S-139 | Logs e diagnóstico: o ping (`diag.ping`) saiu da home para cá e mostra a ida e volta | eq | integração | — | B-30 | ⬜ |
| S-140 | ping com o socket fechado → erro traduzido com "reconectar" | err | integração | `NETWORK_UNREACHABLE` | B-30 | ⬜ |
| S-141 | dois pings seguidos: cada resposta casa com o seu pedido | conc | integração | — | B-30 | ⬜ |
| S-142 | Configurações: a seção está na URL (`/settings/appearance`); seção desconhecida cai na primeira, sem erro | fron | integração | — | B-31 | ⬜ |
| S-143 | Aparência: tema (claro, escuro, do sistema), idioma e densidade mudam na hora e persistem por visitante | eq | integração | — | B-31 | ⬜ |
| S-144 | Workspaces: raízes só leitura (nenhum controle de edição), com o comando do script copiável; recentes com fixar e remover | eq | integração | — | B-31 | ⬜ |
| S-145 | nenhuma seção de Configurações trata do Claude (modelo, permission mode, MCP) — isso é da tela do plano 11 | eq | unit | — | B-31 | ⬜ |
| S-146 | seção registrada por outro plano (Editor do 07, Terminal do 10) aparece no registro; sem registro, não aparece | eq | unit | — | B-31 | ⬜ |
| S-147 | falha ao carregar as raízes em Workspaces → erro traduzido com "tentar de novo" | err | integração | `NETWORK_UNREACHABLE` | B-31 | ⬜ |
| S-148 | Sobre mostra as versões e copia o bloco de versões para um relato de defeito | eq | integração | — | B-32 | ⬜ |
| S-149 | a home não tem mais seletor de workspace, ping nem dispositivos; o store global de workspace selecionado não existe mais | est | unit | — | B-33 | ⬜ |
| S-150 | `/sessions/$sessionId`, `/history` e `/history/$conversationId` não existem mais (D-07): nenhum link, comando ou navegação do app aponta para elas, colar o link antigo cai no "não encontrado" traduzido (a metade do S-06 que veio da F0 — [D-18](decisions.md#d-18--os-cenários-de-rota-que-dependem-de-produto)), e iniciar uma sessão mantém o usuário na aba da pasta | eq | integração | `NOT_FOUND` | B-33 | ⬜ |
| S-151 | todo controle só de ícone nas telas deste plano tem tooltip e `aria-label` traduzidos | eq | integração | — | B-34 | ⬜ |
| S-152 | todo estado vazio das telas deste plano ensina o próximo passo com uma ação; todo erro diz o que fazer | eq | integração | — | B-34 | ⬜ |
| S-153 | "saiba mais" de cada tela abre a ajuda na seção certa | eq | integração | — | B-34 | ⬜ |
| S-154 | cada atalho listado na ajuda de uma tela executa o que diz | eq | integração | — | B-34 | ⬜ |

## E2E — B-35…B-39

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-155 | abrir uma pasta pelo diálogo navegando das raízes → URL → recarga mantém | eq | e2e | — | B-36 | ⬜ |
| S-156 | a sessão iniciada no workbench roda na pasta da aba — o Claude roteirizado reporta o `cwd` | eq | e2e | — | B-36 | ⬜ |
| S-157 | pasta fora da allowlist pela URL → erro com caminho de volta | err | e2e | `WORKSPACE_NOT_ALLOWED` | B-36 | ⬜ |
| S-158 | duas pastas em duas abas: alternar sem perder estado, fechar uma sem afetar a outra, recarga restaura conjunto, ordem e ativa | est | e2e | — | B-37 | ⬜ |
| S-159 | a pasta de uma aba removida do disco: a aba abre em erro, as outras seguem | err | e2e | `WORKSPACE_NOT_FOUND` | B-37 | ⬜ |
| S-160 | abrir pasta pelo menu Arquivo e pela paleta; a notificação de uma recusa aparece como toast e fica no centro de notificações | eq | e2e | — | B-38 | ⬜ |
| S-161 | viewport de celular: seletor de abas, uma view por vez, menu da navegação, sem scroll horizontal | fron | e2e | — | B-39 | ⬜ |
| S-162 | axe sem violação no workbench, na boas-vindas, no diálogo e em cada tela global, nos temas claro e escuro | eq | e2e | — | B-39 | ⬜ |
| S-163 | as rotas que ficam abrem a tela certa — trilha filtrada, regra —, e as removidas pela D-07 (sessão, histórico) caem no "não encontrado" traduzido | eq | e2e | `NOT_FOUND` | B-39 | ⬜ |
| S-166 | a stack de e2e sobe com a árvore de fixtures e a allowlist default — a cópia local de quem roda o teste não muda o resultado | eq | e2e | — | B-35 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Contrato, documentos e rotas (B-01…B-05) | `conc` | a F0 é documento e tabela de rotas: nada nela executa em paralelo. A concorrência das rotas novas está nos cenários de quem as implementa (S-28, S-29, S-46) |
| Contrato, documentos e rotas (B-01…B-05) | `idem` | resolver a mesma rota duas vezes é função pura do router; a repetição que importa — recarregar a URL — está em S-83 e S-158 |
| Sobre (B-12) | `est`, `conc` | leitura sem estado próprio; a versão do CLI vem do cache por versão que o [plano 04 · F3](../04-transcript-and-resume/F3-commands.md) já prova sob concorrência |
| Sistema visual e molduras (B-17…B-19) | `conc` | apresentação sem I/O concorrente; o único recurso compartilhado é o `localStorage`, cujo acesso é síncrono no navegador |
| Casca do workbench (B-21, B-22) | `err` | a casca não faz I/O próprio: a única falha dela — `localStorage` que lança — está em S-113, e o erro de cada view é de quem a registra (planos 07–10) |
| Casca do workbench (B-21, B-22) | `conc`, `idem` | layout sem recurso compartilhado além do `localStorage`, síncrono; a repetição que importa — clicar duas vezes na view ativa — é transição de estado (S-111) |
| Telas separadas (B-28…B-34) | `idem` | as telas movidas mantêm os cenários de repetição dos planos que as criaram ([03](../03-rules-and-audit/scenarios.md), [02](../02-mobile-approval/scenarios.md)); o que muda aqui é a moldura, coberta por S-95 |
| E2E (B-35…B-39) | `conc`, `idem` | concorrência de abertura e repetição são exatas e baratas em integração (S-46, S-107, S-41, S-97); pela porta do usuário custariam minutos para provar o mesmo |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md), ou o código
  novo com a task que o acrescenta. Três casos não têm `code`, e a coluna fica `—`: recusa de
  script e de lint (o erro esperado é a saída ≠ 0), falha de boot ou de recarga da allowlist (o
  erro é o log e o processo que não sobe), e validação que só existe no navegador (atalho em
  conflito, arquivo importado inválido, API do navegador que recusa, `localStorage` que lança).
