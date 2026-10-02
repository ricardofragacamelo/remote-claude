# Plano 06 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> Já decidido pelo usuário em **2026-09-26**, e por isso fora desta tabela: a paridade com o VS
> Code é a de **arquivos** (abrir, criar, funções de arquivo, editar); editor de atalhos, vários
> temas, zen mode, layout configurável, menu completo e walkthrough saem; o chat do Claude e o
> sistema de arquivos e editor ficam **na mesma aba**, lado a lado. Esses fatos entram na ADR-014
> (B-01) como premissa, não como escolha deste plano.

---

## F0 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Construir o workbench em React ou embutir o VS Code (openvscode-server / code-server) | se o VS Code embutido pode ter terminal, tarefas e extensões desligados de forma que não se religuem, e quanto o `iframe` custa em integração com a nossa autenticação | B-01 | 2026-09-26 · **construir em React**, decisão do usuário — o VS Code embutido traria terminal e extensões fora da aprovação e da trilha; a ADR-014 (B-01) registra | ✅ |
| D-02 | A ordem dos planos 06–18 em relação ao que falta do 05 e ao 19 | se algum endpoint novo precisa dos limites HTTP do 05 antes de existir | B-01 | 2026-09-26 · **terminar o plano 05 antes**, decisão do usuário (contra a recomendação): os planos 06–18 começam depois que o 05 fechar; o 18 não é pré-requisito deles | ✅ |
| D-06 | A URL do workbench: pasta na search ou no path | como o TanStack Router trata caminho absoluto com `/` num parâmetro de path, e o que acontece com `#` e `%` | B-05 | 2026-09-28 · **pasta na search** (`/workbench?folder=`, e `&file=` do plano 07 ao lado), decisão do usuário; o gap do splat deixa de importar — o S-04 prova a ida e volta com `#`, `%`, `?` e `&` | ✅ |
| D-07 | O destino da home (`/`) e das rotas antigas (`/sessions/$id`, `/history…`) | nenhum — é escolha de navegação | B-05, B-33 | 2026-09-28 · **`/` abre a aba ativa ou a boas-vindas; `/sessions/$sessionId`, `/history` e `/history/$conversationId` são removidas neste plano**, sem deep link de compatibilidade — decisão do usuário, contra a recomendação, sabendo que o histórico, a retomada e o desfazer de conversa antiga saem do web até o [plano 08](../08-claude-panel/README.md) (o app continua com o histórico). Os specs de e2e que entravam por elas migram para o workbench na B-33 | ✅ |
| D-18 | Os cenários de rota da F0 que dependem de produto de fases seguintes (S-03, S-05 e a metade "removidas" do S-06) | se remover `/sessions` e `/history` já na F0 quebra o e2e que entra por elas (sim: `history-and-resume` e `commands-and-undo`, que só migram na B-33) | B-05 | 2026-09-28 · **parte na F0, resto move**, decisão do usuário, a recomendada: a F0 fixa o mapa e entrega o que não depende de produto — o par que lê e escreve `?folder=` (S-04), o "não encontrado" traduzido para rota reservada (S-07) e as rotas que ficam (S-06); o S-03 vai para a B-16, o S-05 para a B-20, e as removidas para o S-150 da B-33 | ✅ |
| D-10 | Onde persiste o conjunto de abas abertas: `localStorage` por visitante ou preferência do usuário no servidor | se o usuário espera reencontrar as abas no celular ao sair do desktop; custo de uma tabela e quatro rotas | B-04, B-09, B-20 | 2026-09-28 · **servidor**, decisão do usuário: o conjunto e a ordem das abas seguem o usuário; a URL leva só a ativa; o estado de dentro de cada aba fica por visitante em `localStorage` (B-27). As rotas de `open-folders` e o `OPEN_FOLDERS_LIMIT_REACHED` existem | ✅ |

### D-01 — Construir o workbench ou embutir o VS Code

"Algo parecido com o VS Code, completo como é no VS Code" tem uma resposta óbvia e errada: embutir
o próprio VS Code (openvscode-server, code-server) num `iframe`.

| Opção | A favor | Contra |
|---|---|---|
| **Construir em React** sobre a stack fechada | cada porta passa pela nossa permissão e pela nossa trilha; mesma autenticação OIDC, mesma i18n, mesmo design system; mobile-first | mais trabalho; paridade só no que o produto escolhe |
| Embutir openvscode-server/code-server | fidelidade imediata | traz **terminal, tarefas e extensões que executam na máquina fora do `canUseTool` e do hook `PreToolUse`** — a trilha e a permissão, que são a premissa do produto ([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)), deixariam de valer para metade da tela; outro servidor, outra autenticação, outra linguagem de UI; não é responsivo no celular; fura a [stack fechada](../../architecture/shared/00-decisions.md) |

O gap existe para não descartar a alternativa sem olhar: se desligar terminal e extensões fosse
garantido e verificável, o argumento de segurança enfraqueceria. Não é: a configuração do VS Code é
do usuário, e extensões se instalam por ele.

**Recomendação:** construir em React. É a única opção em que "nenhuma tool sensível roda sem um
humano dizer sim" continua verdade na tela inteira. Registrar na ADR-014 com a alternativa descartada
e o motivo.

### D-02 — A ordem em relação aos planos 05 e 19

O plano 05 está em andamento: F0 quase fechada, F1 concluída, **F2 bloqueada** pelo R-01 dele (qual
provedor OIDC real), F3 e F4 não iniciadas. O 06 empacota o produto.

| Opção | Efeito |
|---|---|
| 06–18 esperam o 05 e o 19 | o usuário continua com a interface que chamou de "muito pobre" enquanto um bloqueio de terceiro decide o calendário |
| **06–18 não dependem do que falta do 05 nem do 19** | o 05 termina em paralelo e endurece a superfície **final** (rate limit HTTP, TTL, limites) em vez de uma que vai mudar; o 18 empacota o produto que existe |

**Recomendação:** nenhum dos planos 06–18 depende do que falta do 05 ou do 19. Os endpoints novos
entram sob "os limites do plano 05" quando ele os estender ao HTTP — citado nas tasks, não esperado.
O teto de entradas da listagem ([D-05](#d-05--teto-de-entradas-por-listagem)) já limita o custo por
pedido sem depender de rate limit.

**Decidido em 2026-09-26, contra a recomendação:** os planos 06–18 esperam o 05 fechar; o 19 não é
pré-requisito deles.

### D-06 — A URL do workbench

| Opção | Exemplo | Contra |
|---|---|---|
| **Pasta na search** | `/workbench?folder=%2Fhome%2Fu%2Fprojects%2Fremote-claude` | URL menos bonita |
| Pasta no path | `/workbench/home/u/projects/remote-claude` | parâmetro "splat" com `/`, ambiguidade com rotas filhas futuras (`&file=` do plano 07 viraria outra coisa), e caminho com `#`/`%` exige cuidado dobrado |
| Id opaco da aba | `/workbench/3f2a…` | o link não reproduz a tela em outro dispositivo sem o servidor — falha o teste de [web/04](../../architecture/web/04-state-and-data.md#a-url-é-estado) |

**Recomendação:** pasta na search (`?folder=`), com o arquivo ativo do plano 07 como `&file=` ao
lado. É como `/audit` e `/history` já fazem; o S-04 prova a ida e volta com caracteres especiais.

### D-07 — O destino da home e das rotas antigas

**Recomendação:**

- `/` com abas abertas vai para a aba ativa; sem abas, é a boas-vindas — como o VS Code abre a
  última pasta ou a tela de boas-vindas;
- `/audit?…`, `/rules`, `/rules/$ruleId`: continuam, cada uma na sua tela;
- `/sessions/$sessionId`: vira deep link que abre (ou foca) a aba da pasta da sessão, com a sessão na
  secondary side bar — o chat não é tela própria (decisão do usuário). Sessão inexistente ou de outra
  pessoa mantém o erro traduzido de hoje;
- `/history?workspacePath=` e `/history/$conversationId`: continuam dentro da moldura até o
  [plano 08](../08-claude-panel/README.md) levar o histórico para a view Sessões; lá, viram deep links
  da mesma forma.

**Decidido em 2026-09-28, contra a recomendação:** a home segue a recomendação, e as três rotas
antigas — `/sessions/$sessionId`, `/history` e `/history/$conversationId` — **saem neste plano**, sem
deep link de compatibilidade. `/audit?…`, `/rules` e `/rules/$ruleId` continuam. O que isso custa,
dito ao usuário antes de ele decidir:

- ler, continuar e desfazer uma conversa **antiga** pelo web some até o plano 08 trazer a view
  Sessões; o app continua com o histórico. A sessão **viva** não perde nada: ela está na secondary
  side bar da aba da pasta;
- os specs de e2e que entravam por essas rotas (`history-and-resume`, `commands-and-undo`) migram
  para o workbench na B-33: o que tem porta no workbench passa a entrar por ela, e o que só tinha
  porta em `/history` sai do e2e do web — nunca `skip`. O plano 08 volta a provar esses cenários pela
  porta do usuário;
- link antigo colado no navegador cai no "não encontrado" traduzido.

### D-18 — Os cenários de rota que dependem de produto

Descoberta ao começar a F0. A fase lista S-01…S-07 como cobertos, mas três deles pedem o que só as
fases seguintes constroem:

| Cenário | Precisa de | Que nasce em |
|---|---|---|
| S-03 — `/workbench` sem `folder` cai na boas-vindas | a boas-vindas e a rota do workbench | F2 · B-13, B-16 |
| S-05 — `/` vai para a aba ativa | o conjunto de abas do servidor | F1 · B-09, F3 · B-20 |
| S-06, metade "removidas" | remover `/sessions/$sessionId` e `/history…` | F5 · B-33, na **mesma mudança** que migra os specs de e2e que entram por elas |

| Opção | Contra |
|---|---|
| **parte na F0, resto move** | três cenários mudam de fase |
| só documentar na F0 | S-04, S-06 e S-07 não dependem de produto, e adiá-los deixaria o contrato de rotas sem teste até a F2 |
| tudo na F0, removendo as rotas já | o web fica sem tela de sessão e de histórico até a F3, e a B-33 perde a mudança única "rota sai e spec migra" — contrato quebrado numa ponta só |

**Decidido em 2026-09-28, como recomendado:** a F0 entrega `readWorkbenchSearch`/`workbenchLocation`
(S-04), o `NotFoundRoute` traduzido no root (S-07) e o teste das rotas que ficam (S-06); o S-03 passa
à B-16, o S-05 à B-20, e as rotas removidas caindo no "não encontrado" passam ao S-150 (B-33).

### D-10 — Onde persiste o conjunto de abas abertas

| Opção | A favor | Contra |
|---|---|---|
| `localStorage` por visitante | sem backend; cada dispositivo com as suas abas | o celular não vê as pastas que o desktop abriu; navegador limpo perde tudo; privado não guarda |
| **Preferência do usuário no servidor** | segue para outro dispositivo e sobrevive a limpar o navegador; a aba cuja pasta saiu da allowlist volta **marcada** pelo servidor (S-47) | uma tabela, quatro rotas e a convergência entre duas janelas (S-107) |

**Recomendação:** servidor, para o **conjunto e a ordem** das abas; a URL carrega só a ativa. O
estado **dentro** de cada aba (layout, view, painel) fica por visitante em `localStorage` (B-27) — o
layout do celular não é o do desktop.

**Decidido em 2026-09-28:** servidor, como recomendado.

---

## F1 — Navegar pelas pastas (backend)

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-03 | Alcance do seletor: só dentro das raízes liberadas ou a máquina inteira | nenhum técnico — é a fronteira de segurança | B-06, B-10 | 2026-09-26 · **só dentro das raízes da allowlist**, decisão do usuário; "a máquina toda" é declarar o `$HOME` como raiz pelo `pnpm allowlist add` — configuração, não código | ✅ |
| D-04 | Ocultas, pastas pesadas e symlinks no seletor | nenhum — é escolha de apresentação sobre uma regra já fixa (contenção) | B-06 | 2026-09-28 · **a recomendação**, decisão do usuário: ocultas fora por padrão, com "mostrar ocultas"; nenhuma lista de pastas pesadas; symlink para dentro da raiz listado e marcado, para fora, quebrado ou em ciclo omitido | ✅ |
| D-05 | Teto de entradas por listagem, e como alcançar o que passa dele | o maior diretório real que o usuário abre (`node_modules/.pnpm` de um monorepo, `~/projects`) — **medir** | B-06, B-07 | 2026-09-28 · **teto + `truncated` + `prefix=`**, decisão do usuário, com **1000** como valor de partida; a medição do gap, feita na B-07, só pode ajustar o número, não a forma. **Medido em 2026-09-29:** o maior diretório real, o `node_modules/.pnpm` deste monorepo, tem **977** subpastas (lido inteiro em 7,6 ms; parando em 1001, 3,3 ms); `~/projects` tem 10 — o **1000 fica** | ✅ |
| D-09 | Onde mora a cópia local da allowlist e como o boot a escolhe | como `start-local.mjs`, a stack de e2e e o `.env` escolhem o arquivo hoje; se o schema Zod do backend pode ser lido pelo `.mjs` | B-10 | 2026-09-28 · **`infra/workspace-allowlist.local.yaml`**, decisão do usuário: ignorado pelo git, escolhido pelo `start-local.mjs` quando existe e `RC_WORKSPACE_ALLOWLIST_FILE` não foi definido à mão; e2e e teste nunca o leem; o schema muda para `packages/config`, lido pelo backend e pelo script | ✅ |
| D-14 | Onde gravar recentes e pastas abertas | nenhum — é modelagem; depende da D-10 | B-09 | 2026-09-28 · **tabela nova por pasta**, decisão do usuário: `user_id`, `path` real, `root_path`, `last_opened_at`, `pinned` e `tab_position` (nula quando fechada), por migration versionada nova; a `workspaces` não muda | ✅ |
| D-15 | Como o backend em execução recebe a allowlist nova | se há um processo de backend identificável pelo script em `pnpm dev`, e o que o `nest --watch` faz com sinais | B-11 | 2026-09-28 · **`SIGHUP` chama `reload()`**, decisão do usuário, sem watch do arquivo: a regra de [backend/03 · workspace](../../architecture/backend/03-modules.md#workspace) ("recarga explícita, nunca um watch silencioso") fica como está. O processo **não** reinicia — o handler só troca a lista; o sinal vai ao processo do app, não ao `nest --watch` | ✅ |
| D-19 | O "catálogo de chaves" contra o qual o histórico de notificações valida a `messageKey` | nenhum documento dizia qual catálogo — o do web não é legível pelo backend | B-40 | 2026-09-29 · **lista fechada no domínio `notification`, com os parâmetros de cada chave** — tomada pelo agente na execução, **a confirmar pelo usuário**: as chaves que a D-17 já nomeia; a B-26 acrescenta as suas na mesma mudança que as traduz | ✅ |
| D-20 | Como o `pnpm allowlist` acha o processo do app para mandar o `SIGHUP` | descoberto na execução: o `pnpm dev` roda o backend sob `tsx watch`, e o pid que o script dispara é o do watcher — o `SIGHUP` ali o mataria | B-11 | 2026-09-29 · **o próprio app grava o seu pid em `RC_PID_FILE`** (variável nova, `off` desliga) e o script só sinaliza processo cuja linha de comando roda o `main.ts` — tomada pelo agente na execução | ✅ |
| D-21 | O teto de recentes, e tirar dos recentes a pasta cuja aba está aberta | a B-09 fala em "teto que nunca descarta uma fixada" sem dizer o número; `recente` e `aba` são a mesma linha (D-14) | B-09 | 2026-09-29 · **20 recentes não fixados**, podados ao abrir; tirar dos recentes uma pasta aberta mantém a aba e a tira da lista — tomada pelo agente na execução | ✅ |

### D-03 — Alcance do seletor: dentro das raízes ou a máquina inteira

"Iniciar numa pasta escolhida da máquina" pode ser lido como "navegar pelo disco inteiro". Mas a
allowlist é a primeira linha de defesa ([backend/03](../../architecture/backend/03-modules.md#workspace)):
um seletor que mostra o que está fora dela ensina a quem entra pelo celular o que existe na máquina,
sem abrir nada.

**Recomendação:** só dentro das raízes. "A estação inteira" é declarar `$HOME` como raiz no arquivo
— **configuração, não código** —, e o `pnpm allowlist add $HOME` pede confirmação dizendo o alcance
por extenso (S-54). A raiz do sistema (`/`) é recusada pelo script.

### D-04 — Ocultas, pastas pesadas e symlinks no seletor

**Recomendação:**

- **ocultas** (nome começado por `.`) fora por padrão, com o interruptor "mostrar ocultas" — é o
  diálogo de abrir pasta de todo sistema operacional;
- **pastas pesadas** (`node_modules`, `.git` — esta já é oculta): **sem lista mágica de nomes**. São
  pastas legítimas; o teto da D-05 é o que protege o custo, não um filtro que um dia esconde o que o
  usuário queria abrir;
- **symlink** para dentro da mesma raiz: listado e marcado; para fora, quebrado ou em ciclo:
  **omitido**. Marcar o que escapa ("existe, mas não pode") já diria o que há fora da fronteira.

### D-05 — Teto de entradas por listagem

O teto protege o backend (a iteração para em teto + 1 — S-12) e o celular (uma lista de dez mil
linhas). Mas teto sem saída esconde a entrada que o usuário procura se ela estiver depois do corte.

| Opção | Contra |
|---|---|
| teto sem filtro | o que passa do corte fica inalcançável |
| sem teto | `node_modules/.pnpm` inteiro no celular |
| **teto + `truncated` + filtro por prefixo no servidor** | uma query a mais |

**Recomendação:** teto de **1000** entradas por pedido, `truncated: true` quando corta, e `prefix=`
para alcançar o resto; o número final sai da medição do gap. O diálogo mostra o aviso e usa o que o
usuário digita como prefixo.

### D-09 — Onde mora a cópia local da allowlist e como o boot a escolhe

| Opção | A favor | Contra |
|---|---|---|
| **`infra/workspace-allowlist.local.yaml`, ignorado pelo git, escolhido pelo `pnpm dev` quando existe** | ao lado do default, fácil de achar; `RC_WORKSPACE_ALLOWLIST_FILE` explícito no `.env` continua vencendo | o `.gitignore` precisa da linha (S-56) |
| arquivo fora do repositório (`~/.config/remote-claude/allowlist.yaml`) | nunca é commitado | invisível para quem procura no repositório; outro caminho por sistema operacional |
| só o `.env` apontando para um arquivo qualquer | zero mágica | é exatamente o "editar à mão" que o caso relatado quer evitar |

E o schema: o script `.mjs` não importa TypeScript do backend. Duas cópias do schema divergiriam.

**Recomendação:** `infra/workspace-allowlist.local.yaml`, criado pelo script a partir do default;
`start-local.mjs` o usa quando existe **e** `RC_WORKSPACE_ALLOWLIST_FILE` não foi definido à mão; a
stack de e2e e a de teste **nunca** o leem (S-59). O schema muda para um lugar que os dois leem —
`packages/config`, que já é dependência do backend — e o loader do backend passa a importá-lo de lá.
O boot e o `pnpm doctor` dizem qual arquivo está ativo (S-61).

### D-14 — Onde gravar recentes e pastas abertas

A tabela `workspaces` é por **raiz** (`PRIMARY KEY (user_id, root_path)`, `label NOT NULL`); o
recente deste plano é uma **pasta**, que pode ser subpasta de uma raiz.

| Opção | Contra |
|---|---|
| reusar `workspaces`, gravando a pasta em `root_path` | a coluna passaria a mentir, e o `label` da raiz não é o da pasta |
| **tabela nova por pasta** (`user_id`, `path` real, `root_path`, `last_opened_at`, `pinned`, `tab_position` nula quando fechada) | uma migration |
| duas tabelas (recentes, abas) | duas linhas para o mesmo fato "esta pessoa abriu esta pasta" |

**Recomendação:** uma tabela nova, por **migration versionada nova**, com as abas como a posição
nula-ou-não na mesma linha; a `workspaces` continua dizendo que raiz foi usada, como hoje. O teto de
recentes não descarta fixado (S-38).

### D-15 — Como o backend em execução recebe a allowlist nova

`ReloadableWorkspaceAllowlist.reload()` existe e ninguém o chama.

| Opção | A favor | Contra |
|---|---|---|
| reiniciar o backend | nada novo | o passo escondido que o caso relatado quer eliminar; derruba as sessões vivas |
| **sinal (`SIGHUP`) que chama `reload()`** | explícito, do operador, é o que servidores fazem; sessões vivas intactas | o script precisa achar o processo — o `pnpm dev` registra o pid |
| rota HTTP de recarga | alcançável pela rede | qualquer um com token move a fronteira: é o que o documento proíbe ao dizer que mudar a allowlist exige acesso ao disco |

**Recomendação:** `SIGHUP` chama `reload()`; recarga que falha mantém a lista anterior e loga (S-63);
`pnpm allowlist add` manda o sinal quando acha o backend do `pnpm dev`, e senão diz como recarregar.
Nunca rota HTTP.

**Decidido em 2026-09-28:** `SIGHUP`, como recomendado. Ao decidir, o usuário perguntou se o sinal
reinicia o serviço — **não**: sem handler, o Node trata `SIGHUP` como término; com o handler
registrado, o processo continua e só a lista em memória é trocada, com conexões e sessões vivas
intactas (S-180). Observar o arquivo e recarregar ao salvar foi considerado e **descartado**: bate de
frente com a regra de [backend/03 · workspace](../../architecture/backend/03-modules.md#workspace)
("recarga explícita, nunca um watch silencioso"), e o usuário preferiu manter a regra. No `pnpm dev`,
o `nest --watch` é o processo pai; o sinal vai ao processo do app, pelo pid que o `pnpm dev` registra.

### D-19 — O catálogo de chaves das notificações

A B-40 manda validar a `messageKey` "contra o catálogo de chaves", e nenhum documento dizia qual.
O catálogo de tradução do web é quem de fato renderiza a notificação — mas é um arquivo de outro
módulo, que o backend não lê. E a razão da regra é de segurança: o histórico guarda `messageKey` e
`params` e **nada mais**, e o que impede que ele vire um depósito de texto arbitrário — um comando,
um trecho de conversa — é a chave ser uma que conhecemos, com os parâmetros que ela leva.

| Opção | Contra |
|---|---|
| **lista fechada no domínio `notification`, chave → parâmetros** | cada notificação nova de um plano seguinte entra na lista, na mesma mudança que a traduz |
| só o formato (`a.b.c`, sem espaço) | não é catálogo; um parâmetro livre ainda carregaria conteúdo |
| ler o `en.json` do web no backend | acopla o backend a um arquivo de outro módulo, sem garantia de que as duas pontas concordem |

**Tomada na execução, pelo agente — a confirmar pelo usuário:** a lista fechada, com as chaves que a
[D-17](#d-17--o-que-vira-notificação-e-onde-vive-o-histórico) já nomeia — comando que falhou,
gravação de abas recusada, conexão perdida e recuperada, pasta aberta que saiu da allowlist. Os
parâmetros de cada chave são exatamente os dela: a mais ou a menos é recusado com cada problema em
`details[]`. Toda chave da lista é escrita como `messageKey`, então o `pnpm i18n:check` prova que o
web a traduz ([S-01](scenarios.md)); as traduções entraram no web nesta fase.

### D-20 — Como o `pnpm allowlist` acha o processo do app

A D-15 decidiu que o sinal vai ao processo do app, "pelo pid que o `pnpm dev` registra". Descoberto
ao implementar: o backend de desenvolvimento roda sob `tsx watch` (o documento dizia `nest --watch`),
que reinicia o filho a cada mudança — o pid que o `start-local.mjs` dispara é o do watcher, e o do
filho muda a cada reinício. Medido também que o `enableShutdownHooks()` do Nest, sem lista, escuta
`SIGHUP` e fecharia a aplicação.

**Tomada na execução, pelo agente:** o **próprio app** grava o seu pid no arquivo que
`RC_PID_FILE` aponta (variável nova, obrigatória como todas; `off` desliga, como o
`RC_AUDIT_PURGE_INTERVAL_MS`), e o remove ao sair se ainda for o dele. O `.env.example` a liga para
o `pnpm dev`; as stacks de e2e e de teste a desligam. O script só manda o sinal a um processo cuja
linha de comando roda o `main.ts` — pid reaproveitado pelo sistema depois de uma queda nunca recebe
`SIGHUP`. E o Nest passa a escutar todo sinal de término **menos** `SIGHUP` (`SHUTDOWN_SIGNALS`).

### D-21 — O teto de recentes e o recente de uma aba aberta

A B-09 fala em "teto que **nunca** descarta uma fixada", sem o número. E como recente e aba são a
mesma linha (D-14), "remover um recente" de uma pasta com a aba aberta tinha duas leituras: fechar a
aba junto, ou mantê-la.

**Tomada na execução, pelo agente:** **20** recentes não fixados, podados ao abrir uma pasta;
fixada e aberta nunca saem pelo teto nem contam para ele. Tirar dos recentes uma pasta aberta
**mantém a aba** e a tira da lista (`last_opened_at` nulo, desafixada); fechar depois a aba de uma
pasta que já saiu da lista a esquece de vez. E o `rootLabel` do recente passa a `string | null`,
como o da aba: nulo quando a pasta não vive mais sob raiz nenhuma do usuário.

---

## F2 — Abrir pasta (web)

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-22 | O que a home (`/`) mostra entre a F2 e a B-33 | descoberto na execução: a B-16 tira do store global a origem do `workspacePath`, e o seletor de workspace da home ficaria escolhendo nada | B-14, B-16 | 2026-09-29 · **boas-vindas no lugar do seletor e do "Iniciar sessão"**; ping e dispositivos ficam até a B-33 — tomada pelo agente na execução, **a confirmar pelo usuário** | ✅ |
| D-23 | Abrir uma pasta pela URL quando o usuário já está no teto de abas, antes de existir como fechar uma | descoberto na execução: abrir grava a aba (D-10), e fechar aba só nasce na F3 | B-16 | 2026-09-29 · **aviso traduzido que não bloqueia**: a pasta resolvida continua utilizável e a sessão nasce nela — tomada pelo agente na execução | ✅ |
| D-24 | O atalho do "Abrir pasta…" e quando a lista de recentes ganha busca | a B-14 pede "o atalho à vista" e busca "quando a lista passa de uma tela", sem dizer qual nem quanto | B-14 | 2026-09-29 · **`Ctrl+O` (Mac: `Cmd+O`)**, preso à boas-vindas até o registro de comandos da B-23 assumi-lo; busca com **mais de 8** recentes — tomada pelo agente na execução | ✅ |

### D-22 — O que a home mostra entre a F2 e a B-33

A B-16 manda que o `useWorkspaceStore.selected` deixe de ser a origem do `workspacePath` da sessão, e
a B-33 desmonta a home. Entre as duas, o seletor de workspace da home seleciona uma raiz que ninguém
mais lê — um botão com `aria-pressed` que não muda nada é pior que botão nenhum. E a boas-vindas da
B-14 já lista as raízes.

**Tomada na execução, pelo agente — a confirmar pelo usuário:** a home passa a ser a boas-vindas; o
seletor, o "Iniciar sessão" da home e o store global saem **nesta fase**, porque o último consumidor
deles saiu (a outra metade do S-149 — ping e dispositivos — continua na B-33). O custo: o botão
"Histórico" por raiz, que era a única entrada para `/history?workspacePath=` pela tela, sai três fases
antes da rota (D-07). `/history` e `/history/$id` continuam respondendo pelo link, e a conversa
continua alcançável pela sessão ("Ver a conversa inteira") até a B-33.

### D-23 — Abrir pela URL no teto de abas, antes de existir fechar aba

Abrir uma pasta grava a aba e o recente (`POST /workspaces/open-folders`, D-10), e acima de 8 abas o
servidor responde `OPEN_FOLDERS_LIMIT_REACHED`. Na F2 não há aba na tela, nem como fechá-la — a F3 é
quem as traz.

**Tomada na execução, pelo agente:** a pasta **resolvida** (`GET /workspaces/resolve`) é o que
decide se o workbench abre; a gravação é um passo seguinte, e a recusa dela vira um aviso traduzido
ao lado do nome da pasta, sem tirar a pasta da tela nem impedir a sessão ([S-183](scenarios.md)).
Recusa de **caminho** (fora da allowlist, inexistente, arquivo) continua sendo o estado de erro da
B-16, porque aí não há pasta a mostrar.

### D-24 — O atalho do "Abrir pasta…" e quando a lista de recentes ganha busca

A B-14 pede "o atalho à vista" e busca "quando a lista passa de uma tela", sem dizer qual atalho nem
quantas linhas são uma tela. O registro de comandos e atalhos só nasce na B-23 (F4).

**Tomada na execução, pelo agente:** `Ctrl+O` (Mac: `Cmd+O`) — o do VS Code, que o navegador entrega
à página —, escutado só enquanto a boas-vindas está montada e só na combinação exata (`Ctrl+Shift+O`
continua do navegador). A B-23 o migra para o registro, que passa a ser a única fonte. A busca aparece
com **mais de 8** recentes (`SEARCH_AFTER`): oito linhas de recente cabem numa tela de celular sem
rolar.

---

## F3 — Moldura, abas de pasta e a casca

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-08 | O workbench em tela pequena | nenhum técnico; é a forma no celular | B-01, B-22 | 2026-09-28 · **uma view por vez** abaixo de `md`, decisão do usuário: Explorer, Editor, Claude e Painel na mesma aba de pasta, barra de views embaixo, seletor de abas no topo, um store para os dois layouts | ✅ |
| D-11 | O que uma aba inativa mantém vivo, e o teto de abas | memória de uma aba montada no navegador; o limite `attachedSessions` por connection do [plano 05](../05-hardening-operations/F0-limits.md) — **medir** | B-20 | 2026-09-28 · **híbrido**, decisão do usuário, que resolve a divergência com os planos 08 e 12: store em memória, árvore desmontada, watcher liberado, e **sessões e terminais continuam anexados**; teto de **8** abas, ajustável pela medição. A [D-11 do plano 08](../08-claude-panel/decisions.md#d-11--o-que-a-aba-inativa-mantém) fecha junto | ✅ |
| D-25 | Quando `/` passa a levar à aba ativa (S-05) | descoberto ao começar a F3: a home ainda carrega o ping e os Dispositivos até a B-33, e o redirecionamento os esconderia de quem tem abas abertas — a aprovação de um celular novo inclusive | B-20, B-33 | 2026-09-30 · **S-05 adiado para a B-33**, decisão do usuário, a recomendada: `/` continua a boas-vindas até a home ser desmontada; na F3 a entrada **Workbench** da navegação já leva à aba ativa quando há abas | ✅ |
| D-26 | Como a sessão de uma aba inativa continua anexada (S-181) | descoberto na execução: o store da conversa e a fila de permissão eram **um só** para "a sessão na tela", e o anexo era da tela — desmontar a aba desanexava, e duas sessões anexadas se misturariam | B-20 | 2026-09-30 · **um store por sessão e anexos com dono**: `liveSessionStoreOf`/`permissionQueueOf` e `sessionAttachments` contando donos; a aba e a tela seguram, voltar não manda nada no fio — tomada pelo agente na execução | ✅ |
| D-27 | O que a F3 deixa para a F4 e a F5 | descoberto na execução: o sino da status bar (S-114) é da B-26, os atalhos de alternar side bar e painel e o da ajuda são do registro da B-23, e os primitivos `command`, `menubar`, `sonner` e `select` da B-17 não têm quem os use na F3 | B-17, B-19, B-21 | 2026-09-30 · **cada um nasce com quem o usa**: sino na B-26, atalhos na B-23 (na F3, botões com tooltip), `command`/`menubar`/`sonner` na F4 e `select` na F5; `scroll-area` não foi preciso — tomada pelo agente na execução | ✅ |

### D-25 — Quando `/` passa a levar à aba ativa

A D-18 moveu o S-05 ("`/` com abas abertas vai para a ativa") para a B-20, porque as abas nascem ali.
Mas a home só é desmontada na B-33 (F5): até lá ela carrega o ping e a lista de Dispositivos, e
redirecionar `/` os tiraria da tela de quem tem uma aba aberta — a aprovação de um celular novo
inclusive — por duas fases.

| Opção | Contra |
|---|---|
| **adiar o S-05 para a B-33** | `/` segue sendo a boas-vindas com abas abertas até a F5 |
| antecipar B-29/B-30 (Dispositivos, Logs e diagnóstico) para a F3 | a F3 cresce com telas da F5 |
| redirecionar já, e aceitar a perda | ping e dispositivos inalcançáveis para quem tem abas |

**Decidido em 2026-09-30, pelo usuário, como recomendado:** o S-05 passa à B-33, na mesma mudança
que tira ping e dispositivos da home. Na F3, a entrada **Workbench** da navegação global leva à aba
ativa — a última ativada neste navegador, se ainda aberta; senão a primeira; sem abas, a
boas-vindas ([S-187](scenarios.md)).

### D-26 — Um store por sessão e anexos com dono

A D-11 decidiu que a aba inativa mantém as sessões **anexadas**, com a árvore **desmontada**. O código
de antes não comportava as duas coisas: o store da conversa (`useLiveSessionStore`) e a fila de
permissão eram globais — um para "a sessão na tela" —, e o anexo vivia no efeito da tela, que o
desfazia ao desmontar.

| Opção | Contra |
|---|---|
| **um store por sessão, anexo com contagem de donos** | mexe nos stores de `session` e `permission` e nos seus testes |
| manter a árvore da aba inativa montada e escondida | contraria a D-11 (árvore desmontada), e duas sessões anexadas ainda dividiriam um store |
| reanexar ao voltar, com replay por `seq` | é exatamente o que o S-181 recusa: a permissão pedida com a aba fora da tela não chegaria |

**Tomada na execução, pelo agente:** `liveSessionStoreOf(id)` e `permissionQueueOf(id)` criam o store
na primeira pergunta e o devolvem a quem perguntar de novo; `sessionAttachments.retain(chave, id)`
anexa para o primeiro dono e só conta os seguintes. A moldura do app segura as sessões de todas as abas
abertas (`KeepTabsAttached`) — em qualquer tela, não só no workbench: a pergunta feita enquanto a
pessoa lê a trilha espera na aba —, e a tela da sessão também; fechar a aba solta o anexo e **não
encerra** a sessão. Sair esquece todos os stores. A
regra das três de [web/04](../../architecture/web/04-state-and-data.md#o-store-de-stream) — `seq`
repetido, `gap`, `delta` por mensagem — continua em cada store.

### D-27 — O que a F3 deixa para a F4 e a F5

A F3 lista itens cujo dono nasce depois: o sino de notificações na status bar (S-114) é a UI da B-26;
"alternar side bar e painel pela paleta e por atalho" (B-21) e "o atalho da ajuda" (B-19) dependem do
registro de comandos da B-23; e os primitivos `command`, `menubar`, `sonner` e `select` da B-17 não
têm uso na F3 — gerados agora, seriam código morto até a fase seguinte.

**Tomada na execução, pelo agente:** cada um nasce com quem o usa. Na F3 a status bar tem conexão,
pasta, idioma e tema; side bar, painel e ajuda abrem por botões com tooltip; `command`, `menubar` e
`sonner` entram na F4, `select` na F5, e `scroll-area` não foi necessário (o `overflow` nativo basta).

### D-08 — O workbench em tela pequena

| Opção | Contra |
|---|---|
| a casca inteira, encolhida | ilegível em 360 px; scroll horizontal, proibido por [web/03](../../architecture/web/03-ui-system.md#responsividade) |
| **uma view por vez, barra de views embaixo, abas de pasta como seletor** | trocar de view é um toque a mais |
| uma tela "mobile" separada | duas UIs para manter; o web já é mobile-first |

**Recomendação:** abaixo de `md`, uma view por vez — Explorer, Editor, Claude, Painel — alternadas
**dentro da mesma aba de pasta** (o chat e os arquivos continuam na mesma aba, só não cabem lado a
lado), barra de views embaixo, abas de pasta num seletor no topo, navegação global e menu Arquivo no
menu. O mesmo store serve os dois layouts (S-118).

### D-11 — O que uma aba inativa mantém vivo, e o teto de abas

Hoje `useSessionStream` desanexa ao desmontar (`sub.detach()` no cleanup). Abas inativas desmontadas
perdem o stream; montadas e escondidas mantêm tudo, e custam memória e anexos.

| Recurso | Opção recomendada |
|---|---|
| store da aba (estado de UI) | **mantido** em memória — é o que faz A → B → A não perder nada (S-100) |
| árvore de componentes | **desmontada** — custo zero de render em aba escondida |
| stream de sessão | **desanexa** ao inativar e reanexa com replay por `seq` ao voltar ([web/04](../../architecture/web/04-state-and-data.md#o-store-de-stream)); a **permissão** pendente não depende do stream da aba: ela chega pela fila de permissão, global, e o plano 08 põe o badge na aba de pasta |
| watcher de arquivos (plano 07) | **liberado**; ao reativar, a árvore recarrega |

Teto: **8** abas, dentro do limite de sessões anexadas por connection; o número final sai da medição.

**Recomendação:** a tabela acima. Acima do teto, `OPEN_FOLDERS_LIMIT_REACHED` com `params.limit`, e a
mensagem diz que fechar uma aba não encerra as sessões dela.

**Divergência com dois planos, a resolver ao decidir esta D:** a
[D-11 do plano 08](../08-claude-panel/decisions.md) recomenda que a aba inativa **mantenha as sessões
anexadas** (10 sessões cabem em `maxAttachedSessions` = 16), para a permissão e o stream chegarem sem
reanexar; e o [plano 12](../12-integrated-terminal/README.md) exige que o **terminal** de uma aba
inativa continue anexado, porque a carência de desconexão o mataria. As duas contradizem a linha
"stream de sessão — desanexa" da tabela acima. Quem decidir esta D decide as três juntas e atualiza
os dois planos na mesma mudança.

**Decidido em 2026-09-28 — o híbrido, que resolve a divergência:**

| Recurso | Aba inativa |
|---|---|
| store da aba (estado de UI) | **mantido** em memória (S-100) |
| árvore de componentes | **desmontada** |
| sessões vivas da pasta | **continuam anexadas** — o pedido de permissão e o stream chegam sem reanexar; as dez sessões que a instalação comporta cabem nos 16 de `maxAttachedSessions` (S-181) |
| terminais (plano 12) | **continuam anexados** — suspender deixaria a carência matar o shell |
| watcher de arquivos (plano 07) | **liberado**; ao reativar, a árvore recarrega |
| polling de listas (plano 08) | **parado**; ao reativar, recarrega uma vez |

Teto de **8** abas, ajustável pela medição do gap. A D-11 do plano 08 fecha com este resultado, e o
plano 12 deixa de pedir a exceção: ela está dita aqui.

---

## F4 — Comandos, menu Arquivo, notificações e estado por aba

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-16 | Atalhos que o navegador reserva: quais usar para trocar e fechar aba de pasta | quais combinações Chrome, Firefox e Safari entregam à página — **medir** nos três | B-23 | 2026-09-28 · **a recomendação**, decisão do usuário: `Alt+1…9`, `Ctrl+Alt+PageUp/PageDown` (Mac: `Cmd+Alt+←/→`), fechar só pela paleta e pelo menu; a medição confirma a lista reservada que o registro recusa | ✅ |
| D-17 | O que vira notificação, e onde vive o histórico | nenhum — é escolha de produto | B-26 | 2026-09-28 · **o que vira notificação é a recomendação; o histórico vive no servidor**, decisão do usuário, contra a recomendação: por usuário, **30 dias** de retenção, teto de **200**, "lida" sincronizada entre dispositivos. Nasce a B-40 (backend) | ✅ |
| D-28 | Onde mora o diálogo "Abrir pasta" e quem registra cada comando | descoberto na execução: a B-23 põe "abrir pasta" entre os comandos da casca, e o diálogo existia duas vezes — na boas-vindas e no workbench —, cada um com o seu estado; o comando tem de funcionar em qualquer tela | B-23, B-25 | 2026-09-30 · **um diálogo só, na moldura, e o comando registrado por quem executa a ação, enquanto está montado** (`useCommands`): o diálogo e os recentes pela `workspace`, as abas pelo `Workbench` — "Fechar aba de pasta" não aparece fora do workbench, em vez de ficar desabilitado — tomada pelo agente na execução | ✅ |
| D-29 | Os atalhos que a D-16 não fixou | a B-23 pede atalho para paleta, ajuda, side bar e painel, sem dizer quais | B-23 | 2026-09-30 · **os do editor que o usuário conhece**, fora da lista reservada: paleta `Ctrl/Cmd+Shift+P` e `F1`, ajuda `Shift+F1`, side bar `Ctrl/Cmd+B`, painel `Ctrl/Cmd+J`, abrir pasta `Ctrl/Cmd+O` (D-24); a medição nos três navegadores continua o gap da D-16 — tomada pelo agente na execução, **a confirmar pelo usuário** | ✅ |
| D-30 | O que emite notificação nesta fase, e como vai o nome do comando | a D-17 diz o que **pode** virar notificação; a B-26 não diz quem emite nem com que texto o parâmetro `command` do catálogo vai | B-26 | 2026-09-30 · **comando que falhou, conexão perdida e recuperada, pasta aberta que saiu da allowlist**; `notification.tabs.saveFailed` fica sem emissor, porque a recusa de gravar, fechar ou reordenar aba já tem lugar na tela. `command` vai com o **rótulo traduzido** no idioma de quem o disparou. Rajada de 1,5 s; reenvio em 2, 5, 15, 30 e 60 s e ao reconectar; `INVALID_INPUT` não é reenviado — tomada pelo agente na execução | ✅ |
| D-31 | Onde fica o estado restaurável de cada aba | a F3 guardava os tamanhos numa chave por pasta; a B-27 pede o resto do layout e um gancho para os planos 07 e 08 | B-27 | 2026-09-30 · **um registro de restauração (`tabRestorers`) e uma chave só, `workbench.tabState`, com versão por parte**: o layout da 06 é a primeira entrada; a chave antiga dos tamanhos é ignorada, e quem tinha tamanhos salvos volta aos iniciais uma vez; sair apaga tudo (S-191) — tomada pelo agente na execução | ✅ |

### D-16 — Atalhos que o navegador reserva

`Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+W`, `Ctrl+T`, `Ctrl+N` e `Ctrl+PageUp/PageDown` são do navegador
fora de um app instalado: a página não os recebe, ou recebe e não pode impedir o navegador de agir.
Prometer "Ctrl+Tab troca de aba de pasta" seria um atalho que não funciona.

**Recomendação:** `Alt+1…9` para ir à aba de pasta N, `Ctrl+Alt+PageUp/PageDown` (Mac:
`Cmd+Alt+←/→`) para anterior e seguinte, fechar aba de pasta pela paleta e pelo menu Arquivo, sem
atalho reservado. O registro recusa, com teste, atalho padrão numa tecla da lista reservada; a
medição do gap confirma a lista nos três navegadores.

### D-17 — O que vira notificação, e onde vive o histórico

**Recomendação:**

- vira notificação: erro de ação que não tem lugar na tela (comando da paleta que falhou, gravação de
  aba que o servidor recusou), aviso que o usuário não pediu mas precisa saber (conexão perdida e
  recuperada, allowlist que tirou uma pasta aberta), e o que outros planos emitirem pelo serviço;
- **não** vira notificação: erro que já tem lugar na tela (erro de formulário, estado de erro de uma
  lista) — duplicá-lo é ruído; e permissão pedida, que tem o seu fluxo próprio e mais forte
  ([web/03 · Permissão](../../architecture/web/03-ui-system.md#permissão--a-tela-mais-importante));
- o histórico vive **em memória, na sessão do navegador**, com teto de 100; não vai para o servidor
  nem para `localStorage` — notificação velha de ontem é ruído, e a trilha é o registro permanente do
  que importa.

**Decidido em 2026-09-28:** o que vira notificação segue a recomendação; o **histórico vai para o
servidor**, contra a recomendação — o usuário quer reencontrá-lo em outro dispositivo e depois de
recarregar. As três perguntas que a escolha abriu foram respondidas na mesma conversa:

| Pergunta | Resposta |
|---|---|
| Por quanto tempo o servidor guarda | **30 dias**; um job de limpeza apaga o que passou |
| "Lida" é sincronizada entre dispositivos | **sim**, no servidor; marcar como lida no desktop apaga o badge no celular |
| Teto por usuário | **200**; a mais antiga sai quando passa do teto, junto com o prazo |

Consequências: nasce a [B-40](F1-directory-browse.md#b-40--histórico-de-notificações-no-servidor-)
no backend, com tabela, migration versionada e rotas; a notificação guarda só `severity`, `messageKey`
e `params`, **nunca** conteúdo de conversa nem comando, como o push; o "não perturbe" continua por
visitante; a falha ao gravar não perde o toast. O contrato WebSocket não muda: as janelas convergem
relendo o histórico ao ganhar foco e ao reconectar.

### D-28 — Um diálogo "Abrir pasta", e comandos registrados por quem os executa

Até a F3, "Abrir pasta…" era um estado da boas-vindas e outro do workbench. Com o comando no menu
Arquivo e na paleta de **toda** tela, dois diálogos — ou um terceiro para as telas globais — seriam
três estados para o mesmo gesto.

**Tomada na execução, pelo agente:** o diálogo mora na moldura (`FolderDialogHost`, da `workspace`),
aberto por um store (`useFolderDialog`); a boas-vindas, o `+` das abas, o `Ctrl+O`, o menu e a paleta
abrem o mesmo. Cada comando é registrado por quem executa a ação e enquanto ela existe
(`useCommands`, da `commands`): os de pasta pela `workspace`, os das abas pelo `Workbench`, os do
app (ir para cada tela, tema, idioma, ajuda) pela moldura. Consequência: fora do workbench "Fechar aba
de pasta" **não aparece** no menu — não há o que fechar —, em vez de aparecer desabilitado.

### D-29 — Os atalhos que a D-16 não fixou

**Tomada na execução, pelo agente — a confirmar pelo usuário:** os do editor que o usuário conhece,
todos fora da lista reservada que o registro recusa: paleta `Ctrl/Cmd+Shift+P` e `F1`; ajuda da tela
`Shift+F1` (o `F1` é da paleta); side bar `Ctrl/Cmd+B`; painel `Ctrl/Cmd+J`; abrir pasta
`Ctrl/Cmd+O` (a D-24, agora no registro). Dentro de campo de texto só o da paleta dispara; dentro de
um diálogo, nenhum.

Duas ressalvas, para a medição que a D-16 já pedia nos três navegadores e que não foi feita aqui:
`Ctrl+J` é "Downloads" no Chrome e no Firefox fora do Mac, e falta medir se a página consegue
impedi-lo; e `Cmd+Alt+←/→`, que a D-16 escolheu para trocar de aba no Mac, é o atalho do próprio Chrome
para trocar de aba do navegador no Mac. O registro aceita os dois (não estão na lista reservada), e
a troca, se a medição pedir, é uma linha na declaração.

### D-30 — O que emite notificação nesta fase

A [D-17](#d-17--o-que-vira-notificação-e-onde-vive-o-histórico) diz o que **pode** virar notificação.
**Tomada na execução, pelo agente:**

| Emissor | Chave | Severidade |
|---|---|---|
| comando da paleta, do menu ou de atalho que lançou erro | `notification.command.failed` | erro |
| conexão que caiu / voltou — uma vez por queda | `notification.connection.lost` / `.restored` | aviso / informação |
| pasta de aba aberta que saiu da allowlist durante a sessão | `notification.folder.notAllowed` | aviso |

`notification.tabs.saveFailed` continua no catálogo sem emissor: a recusa de gravar, fechar ou
reordenar aba já tem lugar na tela (o aviso acima da aba e o do `FolderGate`), e a D-17 exclui erro com
lugar. O parâmetro `command` vai com o **rótulo traduzido** no idioma de quem disparou: um id não é
texto para gente, e a notificação que reaparece em outro dispositivo, em outro idioma, mostra o rótulo
no idioma original. A rajada agrupa por 1,5 s; o reenvio de quem não alcançou o servidor espera 2, 5,
15, 30 e 60 s — e sai na hora quando a conexão volta —, sempre com o mesmo `clientId`; `INVALID_INPUT`
(chave ou parâmetro fora do catálogo) não é reenviado e fica marcado só nesta janela.

### D-31 — Um registro de restauração por aba

**Tomada na execução, pelo agente:** o estado restaurável de cada aba é um registro
(`tabRestorers`, no barril da `workbench`): cada entrada declara `id`, `version`, `parse`, `capture`,
`apply` e `subscribe`. O workbench aplica o que foi guardado quando o store da aba nasce — antes de
qualquer coisa dela aparecer — e grava o que muda, numa chave só (`rc.visitor.workbench.tabState`,
formato 1, com a versão de cada parte). O layout da 06 (view, side bar e painel abertos, view no
celular, tamanhos) é a primeira entrada; os planos 07 e 08 registram as suas no carregamento. A chave
antiga dos tamanhos (`workbench.layout:<pasta>`) é ignorada. Fechar a aba descarta o que ela guardou;
ler o conjunto de abas descarta o de pasta que não está mais aberta; sair descarta tudo.

---

## F5 — Telas separadas

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-12 | O que a tela "Logs e diagnóstico" tem neste plano | nenhum — a divisão com o plano 18 | B-30 | 2026-09-28 · **ping e estado da conexão**, decisão do usuário; o plano 18 completa a mesma tela, na mesma rota | ✅ |
| D-13 | Onde vivem as configurações do app, e quais seções entram | nenhum técnico; por item, se segue o usuário ou fica no dispositivo | B-02, B-31 | 2026-09-28 · **a tabela da recomendação**, decisão do usuário: tema, densidade e idioma por visitante; recentes e abas no servidor; raízes só leitura; seções Aparência e Workspaces | ✅ |
| D-32 | O que a F5 decidiu na execução: onde mora o ping, "reconectar", tema do sistema, densidade, busca, licença no "Sobre", o destino do histórico e dos specs de e2e | nenhum — lacunas das tarefas B-29…B-33 | B-29…B-33 | 2026-09-30 · **tomada na execução, pelo agente** — ver a seção | ✅ |

### D-12 — O que a tela "Logs e diagnóstico" tem neste plano

O plano 05 · F1 já está concluído: ingestão dos logs do web e do app, e a tela de diagnóstico **do
app** (`mobile/lib/features/diagnostics`). O web não tem tela nenhuma. O
[plano 18](../18-logs-and-diagnostics/README.md) é dono do visualizador de logs e da saúde.

**Recomendação:** este plano cria a tela com o **ping de ponta a ponta** que sai da home e o estado
da conexão — só o que já existe; o 18 completa a mesma tela, na mesma rota. O plano 05 não precisa
ser avisado: a parte dele que é tela é do app, e continua lá.

### D-13 — Onde vivem as configurações do app, e quais seções entram

| Item | Onde | Por quê |
|---|---|---|
| tema, densidade | por visitante (`localStorage`) | [web/03 · Tema](../../architecture/web/03-ui-system.md#tema) já diz isso; o celular pode querer outro |
| idioma | por visitante | o do push é o `Device.locale`, que já existe e é outro dado |
| recentes, abas abertas | servidor | seguem o usuário (D-10, D-14) |
| raízes liberadas | arquivo no disco, **só leitura** na UI | mudar exige acesso à máquina ([backend/03](../../architecture/backend/03-modules.md#workspace)) |

**Recomendação:** a tabela acima, com as seções **Aparência** e **Workspaces** neste plano; "Editor"
(plano 07) e "Terminal" (plano 12) entram pelo registro de seções. Configuração do Claude (modelo,
permission mode, MCP) **não** é seção daqui: é tela própria do [plano 13](../13-claude-settings/README.md).
Dispositivos também não: é tela própria (B-29).

### D-32 — O que a F5 decidiu na execução

**Tomada na execução, pelo agente.** As tarefas diziam o quê; faltava onde e como:

| Assunto | Escolha | Por quê |
|---|---|---|
| Onde mora o ping | sai de `features/session` para `features/diagnostics` — serviço, store, hook e painel | é a feature da tela; `session` fica com a sessão viva |
| "Reconectar" | um método do `wsClient`, `reconnect()`: cancela a espera do backoff e conecta já; com o socket aberto ou conectando não faz nada; **segurado pelo servidor** (`throttled`) não tenta antes do prazo — o botão fica desabilitado e a tela diz por quê (S-200) | voltar logo depois de ser fechado por excesso é o excesso de novo (plano 05) |
| Ping com o socket fora do ar | o botão segue clicável, e o clique vira `NETWORK_UNREACHABLE` traduzido com "reconectar" ao lado (S-140) | um botão desabilitado não diz o que fazer |
| Pings seguidos | **um em voo por vez** — o duplo clique manda um só ([00 · S-110](../00-bootstrap/scenarios.md)); cada pedido é uma linha, que espera até o pong com o **mesmo `nonce`**, com a ida e volta medida no relógio do navegador; pong sem pedido desta tela (outra janela, o replay) não encerra a espera de ninguém (S-141, S-205) | "cada resposta casa com o seu pedido", sem desfazer o S-110 do plano 00 |
| Tema | continuam **dois temas**; a **preferência** tem três valores — claro, escuro e do sistema (o padrão), que acompanha o `prefers-color-scheme` ao vivo (S-202). O botão da status bar e o comando da paleta escolhem à mão | web/03 · Tema: escuro é o default quando o sistema pede; o S-143 pede "do sistema" como escolha |
| Densidade | dois valores, `compact` (o padrão, o molde do VS Code) e `comfortable`, trocando os tokens da escala por `data-density` no `<html>`; o alvo de toque de 44 px não muda | "a densidade é decidida em `globals.css` uma vez" — a escolha muda o token, não o componente |
| "Restaurar padrão" | tema → do sistema; idioma → **esquece** a escolha e volta ao do navegador; densidade → compacta | o padrão é o que a pessoa teria sem nunca ter escolhido |
| Busca das Configurações | sobre as **opções que cada seção declara** no registro (id e rótulo), pelo rótulo traduzido; o resultado leva à seção (S-203) | uma seção de outro plano entra na busca por registrar-se, sem editar a tela |
| Onde nascem as seções | o registro `settingsSections`, no barril de `settings`, já com Aparência e Workspaces declaradas; o conteúdo de Workspaces vem do barril de `workspace` (raízes, comando do script, recentes) | a seção precisa existir quando a rota decide se a da URL é conhecida; registrada por um efeito, `/settings/workspaces` cairia na primeira no primeiro render |
| Licença no "Sobre" | o repositório **não declara licença** (nenhum `LICENSE`, `private: true` sem `license`): a tela diz isso, em vez de inventar uma; "documentação" leva ao índice `docs/` do repositório | escrever uma licença é decisão do dono do projeto, não desta fase |
| `/` com abas | a boas-vindas espera o conjunto de abas (esqueleto, não um relance da boas-vindas) e, havendo abas, **substitui** o endereço pelo da aba ativa (S-05) | substituído, para "voltar" não cair num laço entre `/` e a aba |
| Os componentes do histórico | `HistoryScreen`, `ConversationList` e a retomada **ficam** nas features, sem rota; o `SessionScreen` perde o "ver a conversa inteira" até o plano 08 (o `onOpenHistory`, sem quem o passe, não renderiza o botão) | a view Sessões do [plano 08](../08-claude-panel/decisions.md#d-24--o-link-de-uma-sessão-e-de-uma-conversa) os remonta pelo link da D-24 dele |
| Specs de e2e | `commands-and-undo` (04·S-49…S-51) e `history-and-resume` · `history-gap` (04·S-47) abrem a sessão **pela aba da pasta**, com "Iniciar sessão" na side bar, e a suíte se anexa a ela para o que só um socket faz; `history-resume` (04·S-46) e `history-workspace-removed` (04·S-53) **saem** do e2e do web — só tinham porta em `/history` —, devolvidos ao plano 08; o `limits` · idle (05·S-42) deixa de seguir "ver a conversa inteira" (o texto que aponta o histórico fica: o app o tem); o `vertical-slice` pinga em `/diagnostics` | B-33: o que tem porta no workbench entra por ela; o resto sai, nunca `skip` |

---

## F6 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto — a fase prova o que as anteriores entregaram | — | — | — | — |
| D-33 | O que a F6 decidiu na execução | as tarefas diziam o que provar; faltava como o Claude roteirizado diz o `cwd`, como uma aba sai da allowlist sem mexer na allowlist e com que axe | B-35…B-39 | 2026-09-30 · ver a seção abaixo — tomada pelo agente na execução | ✅ |

### D-33 — O que a F6 decidiu na execução

**Tomada na execução, pelo agente.**

| Assunto | Escolha | Por quê |
|---|---|---|
| O Claude que reporta o `cwd` | uma gravação nova, **`cwd-turn`**, capturada pelo `pnpm fixtures:record` (o CLI real responde só o caminho do diretório em que roda); o replay põe o diretório da sessão onde a gravação diz `/workspace` — **só no que o Claude diz** (texto da resposta e o `result`), nunca no input de uma tool | fixture escrita à mão provaria só o fake (01 · D-04); o `/workspace` é o nome que o gravador dá ao diretório descartável, e o CLI rodando na pasta da aba diria aquela pasta. Input de tool fica intacto porque as regras concedidas pelas specs casam nele (`Write(/workspace/…)`) |
| A allowlist da stack de e2e | a spec lê a allowlist **default** do repositório e a cópia local, se houver: a API e o diálogo listam exatamente as raízes da default, e nenhuma raiz só da cópia local (S-166) | a máquina de quem roda o teste pode ter a cópia local (a desta tem); uma stack que a lesse testaria a máquina, não o produto |
| Uma pasta de aba que sai da allowlist | a pasta é trocada no disco por um link simbólico que sai da raiz; o caminho que a aba guarda é o mesmo, e o backend, que resolve todo link, a recusa (S-160) | a stack não recarrega a allowlist (`RC_PID_FILE=off`, S-59), e editar a default mudaria todas as specs da execução |
| A releitura das abas que revela a recusa | abrir outra pasta (menu Arquivo) invalida as abas; é essa leitura que acha a pasta recusada e emite a notificação | é o caminho de quem usa: a janela relê as abas quando algo muda nelas; esperar o `staleTime` de 30 s seria `sleep` |
| axe no navegador | `@axe-core/playwright` no pacote `e2e`, com as tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; o tema é o do sistema, escolhido pelo `colorScheme` do navegador | o `jest-axe` roda em jsdom, sem layout nem cor: contraste só se julga aqui; o tema "do sistema" é o padrão, e o navegador que pede escuro o prova sem escrever preferência |
| Estado das abas numa recarga | o web esquece sessões, filas de permissão e o estado das abas quando o status de autenticação **passa a** `anonymous` (saída, ou renovação recusada) — não mais no `session === null` com que toda página começa | o S-158 achou que toda recarga apagava o layout guardado das abas: o S-134 só valia em jsdom, que monta já autenticado. Regressão coberta no `providers.spec` |
| Foco ao abrir o centro de notificações | o próprio sheet recebe o foco, como no `HelpDrawer` | o S-160 achou o foco no primeiro botão ("não perturbe"), cujo tooltip abre no foco: o primeiro `Esc` fechava o tooltip, não o centro |
| O status de uma recusa no log de I/O | o interceptor fecha o par `http.request`/`http.response` quando a resposta é escrita (`close`), preso ao contexto do trace; resposta já escrita fecha na hora | lia `statusCode` antes de o exception filter escrever: toda recusa saía com 200 (S-209) |
| O runner do e2e e o log do backend | a suíte roda com `runAsync`, e o log do backend vai para `e2e/.backend.log` em **toda** execução, apagado no teardown | o `run` síncrono segurava o loop que drena o pipe do backend: o log parava no boot — o `smoke-live` lia um arquivo sem o que procurava —, e um pipe cheio travaria o backend (S-210) |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 06`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**. A numeração segue a ordem em que o roteiro dos planos
  06–18 as citou, e não a das fases — outros planos já as referenciam pelo número (a D-11 pelo 07).
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
