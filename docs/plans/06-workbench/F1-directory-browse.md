# F1 — Navegar pelas pastas (backend)

Plano: [06 — Workbench](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md).
**Entrega:** o backend lista as subpastas de uma pasta liberada, um nível por pedido, com a mesma
fronteira do `ResolveWorkspaceUseCase`; lembra as pastas recentes (fixáveis) e as abertas; diz as
versões para a tela "Sobre"; e o desenvolvedor libera `~/projects/remote-claude` com um comando,
sem editar YAML à mão e sem afrouxar a fronteira.

---

## Por quê

O caso relatado que abre este plano: a sessão nasceu em `/tmp/remote-claude-workspaces`, "que não
é git nem nada", porque a allowlist de desenvolvimento só declara essa raiz — e porque a home
escolhe a primeira raiz sem perguntar. Duas causas, duas metades da resposta:

- **não há como liberar o projeto em que se trabalha** sem editar o arquivo versionado — e editá-lo
  poria o caminho da máquina de alguém no repositório. A B-10 resolve com uma cópia local, ignorada
  pelo git, escrita por script;
- **não há como escolher uma subpasta** a não ser digitando o caminho. `ResolveWorkspaceUseCase`
  já aceita qualquer subpasta de uma raiz; falta poder **ver** o que há dentro. A B-06…B-08 criam a
  listagem.

A regra de listagem é pura e vive no domínio: é a primeira linha de defesa ganhando uma porta
nova, e tem a mesma exigência de cobertura que a
[regra do `workspace`](../../architecture/backend/03-modules.md#workspace).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-06 — Regra de listagem dos filhos de um `WorkspacePath` 🔲

Serviço de domínio, sem I/O: recebe as entradas que o port leu (nome, tipo, e, para symlink, o
realpath do alvo) e devolve a listagem.

- **só diretórios** — arquivo, socket, fifo e dispositivo ficam fora;
- **ordenação** estável, sem distinção de caixa e com números em ordem natural (`dir2` antes de
  `dir10`), para que a mesma pasta liste sempre igual;
- **flag `hidden`** para nome começado por `.`, e o filtro que a
  [D-04](decisions.md#d-04--ocultas-pastas-pesadas-e-symlinks-no-seletor) decidir;
- **symlink**: alvo dentro da **mesma raiz** → listado com `symlink: true`; alvo fora da raiz,
  quebrado ou em ciclo → omitido. Listar o link que escapa já diria o que existe fora da fronteira;
- **teto** de entradas ([D-05](decisions.md#d-05--teto-de-entradas-por-listagem)) com `truncated`,
  e o filtro por prefixo que deixa alcançar o que o teto cortou;
- `parent` é `null` quando o caminho é a própria raiz.

Unit cobre cada partição; a contenção reusa a do `Workspace` (`contains`) — nenhuma comparação de
string nova.

### B-07 — Port `WorkspaceDirectoryLister` e o adapter `fs.opendir` 🔲

Port em `application/workspace/ports/`, adapter em `adapter/outbound/filesystem/`, ao lado do
`node-workspace-directory.probe`:

- `fs.opendir` iterado, **parando no teto + 1** — o custo da listagem não pode crescer com o
  tamanho do diretório (`node_modules/.pnpm` passa de milhares de entradas);
- `Dirent` resolve o tipo sem `stat` para o caso comum; symlink recebe `realpath` — e só ele;
- entrada que some entre a leitura e o `realpath` é omitida, não derruba a listagem;
- `EACCES`/`EPERM` ao abrir o diretório → `WORKSPACE_DIRECTORY_UNREADABLE`;
- log de I/O em `debug` com caminho, contagem, `truncated` e duração — **nunca** a lista de nomes
  ([03-logging](../../architecture/shared/03-logging.md#a-regra-do-io-em-debug)).

Integração contra diretórios reais montados no teste (tmpdir com symlinks, pasta sem permissão,
nomes com espaço, acento, emoji e quebra de linha).

### B-08 — Caso de uso e rota `GET /workspaces/directories` 🔲

`ListDirectoriesUseCase` na ordem do `ResolveWorkspaceUseCase`: regra pura da allowlist →
existência → contenção **no realpath** → é diretório → lista. A allowlist é lida **a cada uso**
(é recarregável), nunca capturada no construtor.

Controller no `WorkspaceController`, com o DTO da [B-04](F0-contract.md#b-04--contrato-das-rotas-http-do-workspace-).
Cada recusa com o status que ela é ([04-errors-and-http](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http)):
`400` caminho que não é caminho, `403` fora de toda raiz ou raiz de outra pessoa, `404` inexistente,
`422` arquivo ou ilegível. O comentário do controller que diz "neither walks the disk" é corrigido
junto — ele passaria a mentir.

### B-09 — Pastas recentes e pastas abertas 🔲

Depende da [D-10](decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas) e da
[D-14](decisions.md#d-14--onde-gravar-recentes-e-pastas-abertas).

- **migration versionada nova** ([backend/05](../../architecture/backend/05-persistence.md#migrations))
  com a tabela de pastas por usuário — `path` real, raiz, `last_opened_at`, e a posição da aba
  quando aberta —, escopada por `user_id` desde o primeiro dia como a `workspaces`;
- `GET /workspaces/recent`: as do usuário, fixadas primeiro, depois por `last_opened_at` desc,
  com teto que **nunca** descarta uma fixada; a que saiu da allowlist ou sumiu vem
  `available: false`, revalidada na leitura; fixar/desafixar e remover são idempotentes;
- as pastas abertas (`GET|POST|DELETE /workspaces/open-folders`, `PUT …/order`), conforme a B-04:
  abrir resolve pela mesma regra (fora da allowlist → `403` e **nada é gravado**), grava o recente
  e é idempotente; fechar é `204` sempre; o teto dá `409 OPEN_FOLDERS_LIMIT_REACHED`;
- abrir em duas janelas ao mesmo tempo converge para uma linha só (upsert pela chave).

Fechar uma pasta **não** encerra sessão do Claude: sessão é do módulo `session`, e este módulo nem
a conhece.

### B-10 — Raízes locais de desenvolvimento: `pnpm allowlist` 🔲

Script em `scripts/allowlist.mjs`, registrado no `package.json` e no catálogo de
[Comandos](../../../README.md#comandos) do README — a
[regra 10 do AGENTS.md](../../../AGENTS.md#regras-que-valem-sempre-não-precisam-de-leitura-adicional):
tarefa repetitiva vira script.

```bash
pnpm allowlist add ~/projects/remote-claude   # libera a pasta para os usuários do realm de dev
pnpm allowlist list                           # o arquivo ativo e as raízes dele
pnpm allowlist remove ~/projects/remote-claude
```

- escreve numa **cópia local ignorada pelo git**, criada a partir do default na primeira vez (a
  raiz Scratch continua lá) — onde ela mora e como o boot a escolhe é a
  [D-09](decisions.md#d-09--onde-mora-a-cópia-local-da-allowlist-e-como-o-boot-a-escolhe);
- **validada pelo mesmo schema** que o backend usa no boot — um schema, não dois: se o `.mjs` não
  pode importar o do backend, o schema muda de casa para um pacote que os dois leem (D-09);
- expande `~`, resolve relativo contra o diretório corrente e **mostra** o caminho absoluto que
  gravou; recusa caminho inexistente, arquivo e a raiz do sistema (`/`); para `$HOME` pede
  confirmação dizendo o alcance por extenso — "o Claude poderá ler, escrever e executar em toda a
  sua pasta pessoal" ([D-03](decisions.md#d-03--alcance-do-seletor-dentro-das-raízes-ou-a-máquina-inteira));
- `users` padrão: os do realm de desenvolvimento, iguais aos do default; `--user <sub>` repetível
  para outro;
- escrita atômica (temporário + `rename`), `add` repetido não duplica, `remove` do que não existe
  sai 0;
- a stack de e2e e a de teste **ignoram** a cópia local — o que o desenvolvedor liberou na máquina
  dele não pode mudar o resultado de um teste;
- `pnpm doctor` e o log de boot dizem **qual** arquivo de allowlist está ativo.

Testes do script em `test/unit/scripts` e `test/integration/scripts`, como os demais `scripts/`.

### B-11 — O backend em execução passa a ver a raiz nova 🔲

`ReloadableWorkspaceAllowlist.reload()` existe, está testado e **ninguém o chama**: a "recarga
explícita" do documento não tem gatilho. Sem ele, `pnpm allowlist add` exige reiniciar o backend —
e o caso relatado continua com um passo escondido.

O gatilho é a [D-15](decisions.md#d-15--como-o-backend-em-execução-recebe-a-allowlist-nova). Qualquer
que seja, preserva o que o documento exige: explícito (nunca watch), recarga que falha **mantém a
lista anterior** e loga o erro, e sessões vivas não são tocadas — a allowlist só vale para o que
se abre depois.

### B-12 — Versões para a tela "Sobre" 🔲

Rota autenticada que devolve as versões do backend, do Agent SDK, do CLI do Claude e do Node —
o que alguém cola num relato de defeito. A do CLI vem do `cli-version` que o plano 04 já usa, com o
cache por versão: pedir o "Sobre" não sobe um subprocesso. O que não se pôde ler volta `null` com o
motivo, e a resposta continua `200`: a tela existe justamente para quando algo está errado.

---

## Cenários cobertos

S-08…S-68.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
