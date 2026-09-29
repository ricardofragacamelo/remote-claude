# F0 — Contrato

Plano: [06 — Workbench](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada neste plano. Pressupõe o [plano 04](../04-transcript-and-resume/README.md)
concluído.
**Entrega:** a ADR-014 registrada, os documentos normativos do web e do backend dizendo o que é o
workbench, o contrato HTTP das rotas novas do módulo `workspace` com os códigos de erro no
catálogo, e o desenho de rotas do web — antes de uma linha de produto.

---

## Por quê

Este plano troca a forma do web inteiro: a coluna única `max-w-3xl` vira uma moldura com
navegação global e, dentro dela, um workbench de painéis por pasta. Mudar isso sem antes dizer,
nos documentos normativos, o que é o layout, o que vive na URL e o que o backend pode listar do
disco, é deixar cada uma das fases seguintes — e os planos que constroem em cima (07 a 13, 14 a 16) —
decidir por conta própria. A F0 é o contrato que os outros leem.

E há uma regra do backend que muda de sentido: "`GET /workspaces` não varre disco". Listar
subpastas é ler o disco. A mudança tem de ser **dita** — um nível, sob demanda, dentro da
allowlist —, não descoberta no code review da F1.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — ADR-014: o web vira um workbench, construído em React ✅

A ADR-014 foi **aberta em 2026-09-26** em [00-decisions](../../architecture/shared/00-decisions.md#adr-014--o-web-vira-um-workbench-construído-em-react),
quando o usuário decidiu a D-01 e a D-03. Esta task a **completa** — com as decisões de apresentação
que ainda faltam — e confere que ela diz:

- **o workbench de painéis substitui a coluna única** a partir de `md`; abaixo disso, uma view por
  vez ([D-08](decisions.md#d-08--o-workbench-em-tela-pequena));
- **construir em React sobre a stack fechada, e não embutir openvscode-server/code-server**
  ([D-01](decisions.md#d-01--construir-o-workbench-ou-embutir-o-vs-code)). O argumento que decide
  é de segurança, não de esforço: o VS Code embutido traz terminal e extensões que executam na
  máquina **fora** do `canUseTool` e do hook `PreToolUse` — furariam a trilha e a permissão, que
  são a premissa do produto ([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse));
- **cada pasta aberta é uma aba com um workbench completo** (explorer, editores, painel do Claude,
  sessões), várias abertas ao mesmo tempo. Isso **não** é multi-root workspace (várias raízes numa
  árvore só), que continua fora;
- **uma tela por assunto**: a navegação global leva a telas próprias — Workbench, Auditoria,
  Regras, Dispositivos, Uso e custo ([plano 14](../14-usage-and-cost/README.md)), Logs e diagnóstico,
  Configuração do Claude ([plano 11](../11-claude-settings/README.md)) e Configurações do app; e,
  pelo menu de gerenciar, Sobre. Configurações do app e configuração do Claude **nunca** dividem
  uma tela;
- **a paridade com o VS Code é a de arquivos** — abrir, criar, funções de arquivo e editar
  (decisão do usuário de 2026-09-26). Da casca, entra o que serve a isso: abas de pasta, menu
  **Arquivo**, command palette, centro de notificações, estado restaurado por aba. Editor de
  atalhos, vários temas, zen mode, layout configurável, menu completo e walkthrough ficam fora;
- o que fica de fora, e para onde vai ([Não entra](README.md#não-entra)).

A ADR cita as decisões D-01, D-08 e D-10 com o resultado de cada uma; se alguma ainda estiver
aberta quando a B-01 começar, a F0 não começa.

### B-02 — `web/03`, `web/04` e `web/02`: layout, sistema visual, estado por aba ✅

Atualizar os documentos normativos do web, que hoje descrevem uma coluna com cards:

- [web/03-ui-system](../../architecture/web/03-ui-system.md) — seção nova **"Workbench"**:
  moldura do app (navegação global e menu Arquivo), anatomia do workbench (activity bar, side
  bar, área de editor, secondary side bar, painel inferior, status bar), abas de pasta, **moldura de
  tela** (cabeçalho com título, propósito numa linha e o painel de ajuda — B-19), command palette,
  registro de comandos e atalhos, centro de notificações. A
  [Responsividade](../../architecture/web/03-ui-system.md#responsividade) ganha a regra de `< md`
  (D-08). O [Tema](../../architecture/web/03-ui-system.md#tema) ganha o **sistema visual**:
  densidade no molde do VS Code, escala de espaçamento e tipografia por token, ícones só do
  `lucide-react` (já dependência do web), temas claro e escuro pelos mesmos nomes de variável, escuro
  como default quando `prefers-color-scheme: dark`;
- [web/04-state-and-data](../../architecture/web/04-state-and-data.md#onde-cada-estado-mora) —
  **estado de aba de pasta**: store por pasta, criado por fábrica e chaveado pelo caminho real,
  nunca um global compartilhado; o que está na URL (a aba ativa, a view, a seção de
  configurações); o que é conveniência por visitante em `localStorage`, sempre com `try/catch`
  (tamanhos de painel, tema, estado restaurável da aba); o que vai para o servidor
  ([D-10](decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas),
  [D-13](decisions.md#d-13--onde-vivem-as-configurações-do-app-e-quais-seções-entram));
- [web/02-folder-structure](../../architecture/web/02-folder-structure.md) — onde moram as
  features novas (`workbench`, `commands`, `notifications`, `diagnostics`, `settings`, `about`) e o
  que sai do `app/` (o `Screen` de coluna única dá lugar à moldura).

Documentar a regra antes de escrevê-la é o que permite aos planos seguintes apontarem para cá em vez
de reinventarem o layout cada um.

### B-03 — `backend/03`, `04-errors-and-http` e o catálogo: listar pasta passa a existir ✅

Em [backend/03-modules · workspace](../../architecture/backend/03-modules.md#workspace):

- **a listagem de subpastas relativiza "não varre disco"** e diz em que termos: **um nível**, **sob
  demanda** (um pedido, um diretório), **só diretórios**, **dentro da allowlist**, com teto de
  entradas e `truncated` ([D-05](decisions.md#d-05--teto-de-entradas-por-listagem)), contenção
  de novo no realpath como o `ResolveWorkspaceUseCase` já faz. Nunca recursivo, nunca a árvore;
- as rotas novas do módulo (B-04), com o status de cada recusa;
- as raízes locais de desenvolvimento (B-10): o default versionado continua sem caminho da
  máquina de ninguém;
- a rota de versões do "Sobre" (B-12), no módulo que o documento indicar — ela lê a versão do CLI
  pelo mesmo caminho que o [plano 04 · F3](../04-transcript-and-resume/F3-commands.md) já usa.

Em [backend/03 · notification](../../architecture/backend/03-modules.md#notification): o módulo
ganha o **histórico do centro de notificações** (B-40,
[D-17](decisions.md#d-17--o-que-vira-notificação-e-onde-vive-o-histórico)) — por usuário, 30 dias,
teto de 200, "lida" no servidor, e a mesma regra do push: `messageKey` e `params`, nunca conteúdo de
conversa nem comando.

No [catálogo de erros](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio),
**antes** de existir no código, e em `backend/src/shared/errors/error-catalogue.ts` com
`messageKey` em `en` e `pt-BR`:

| `code` novo | HTTP | Quando |
|---|---|---|
| `WORKSPACE_DIRECTORY_UNREADABLE` | 422 | o diretório existe, está liberado, e o **processo do backend** não tem permissão de leitura (`EACCES`/`EPERM`). Não é 403: a autorização do usuário passou; é o sistema de arquivos que torna o pedido impossível |
| `OPEN_FOLDERS_LIMIT_REACHED` | 409 | abrir mais uma pasta com o teto de abas já atingido (`params.limit`) — conflito com o estado atual, não validação ([D-11](decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas), [D-10](decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas)) |

### B-04 — Contrato das rotas HTTP do `workspace` ✅

O contrato, escrito no `backend/03` e espelhado nos DTOs Zod do controller e nos tipos do
service do web:

- `GET /workspaces/directories?path=&hidden=&prefix=` → `{ path, root, parent, entries[{ name,
  path, hidden, symlink }], truncated }`. `parent` é `null` na raiz — o seletor nunca sobe acima
  dela. `path` obrigatório e absoluto; `hidden` e `prefix` conforme a
  [D-04](decisions.md#d-04--ocultas-pastas-pesadas-e-symlinks-no-seletor) e a D-05. Recusas: `400`
  `INVALID_INPUT`, `403` `WORKSPACE_NOT_ALLOWED`/`FORBIDDEN`, `404` `WORKSPACE_NOT_FOUND`, `422`
  `WORKSPACE_NOT_A_DIRECTORY`/`WORKSPACE_DIRECTORY_UNREADABLE`;
- `GET /workspaces/recent` → `{ folders[{ path, rootLabel, lastOpenedAt, pinned, available }] }` —
  `available: false` para a pasta que saiu da allowlist ou sumiu, em vez de sumir da lista;
  `PUT /workspaces/recent/pin { path, pinned }` e `DELETE /workspaces/recent?path=` (`204`, também
  quando não existia);
- as pastas abertas, no servidor pela [D-10](decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas): `GET /workspaces/open-folders` (as abas, em ordem, cada uma
  com `state: available | notAllowed | missing`), `POST /workspaces/open-folders
  { path }` (`201` ao abrir, `200` com a existente se já aberta — idempotente), `DELETE
  /workspaces/open-folders?path=` (`204`, também quando não estava aberta) e `PUT
  /workspaces/open-folders/order { paths }` (`409` `CONFLICT` se o conjunto não é o aberto).
  Abrir grava o recente ([D-14](decisions.md#d-14--onde-gravar-recentes-e-pastas-abertas));
- a rota de versões do "Sobre" → `{ backend, web?, agentSdk, claudeCli, node }`, com `null` e o
  motivo para o que não se pôde ler — nunca `500` porque o CLI não respondeu;
- o histórico de notificações (B-40, [D-17](decisions.md#d-17--o-que-vira-notificação-e-onde-vive-o-histórico)):
  `GET /notifications?cursor=` → `{ items[{ id, severity, messageKey, params, count, createdAt,
  readAt }], unread, nextCursor }`, mais nova primeiro; `POST /notifications { clientId, severity,
  messageKey, params, count }` (`201` ao gravar, `200` com a existente para o mesmo `clientId` —
  idempotente); `PUT /notifications/read { ids }` e `PUT /notifications/read-all` (`204`, também
  para id que não existe); `DELETE /notifications/:id` e `DELETE /notifications` (`204` sempre).
  `messageKey` fora do catálogo de chaves ou `params` fora do schema → `400` `INVALID_INPUT`.

**Este plano não muda o contrato WebSocket.** O ping (`diag.ping`), a sessão e o stream seguem
como estão; por isso `pnpm test:e2e:mobile` não entra no critério de conclusão. Endpoint novo entra
sob os limites do [plano 05](../05-hardening-operations/README.md) quando ele os estender ao HTTP.

### B-05 — Desenho de rotas e da navegação ✅

O mapa de rotas, documentado em `web/04` e testado pelo router:

| Rota | Tela |
|---|---|
| `/` | boas-vindas — ou a aba ativa, se há abas abertas ([D-07](decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)) |
| `/workbench?folder=<path>` | o workbench, com a pasta ativa na **search** ([D-06](decisions.md#d-06--a-url-do-workbench)) — o link reproduz a tela |
| `/audit?…`, `/rules`, `/rules/$ruleId` | Auditoria e Regras, com o conteúdo de hoje e os deep links intactos; o redesenho é dos planos [12](../12-audit-explained/README.md) e [13](../13-rules-management/README.md) |
| `/devices` | Dispositivos, com a lista de hoje; a profundidade é do [plano 15](../15-devices/README.md) |
| `/diagnostics` | Logs e diagnóstico, mínima — o ping; completada pelo [plano 16](../16-logs-and-diagnostics/README.md) |
| `/settings/$section` | Configurações do app, uma seção por vez |
| `/about` | Sobre |
| `/claude…`, `/usage…` | **reservadas** aos planos 11 e 14; este plano não as renderiza |
| `/sessions/$sessionId`, `/history`, `/history/$conversationId` | **removidas** ([D-07](decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)): caem no "não encontrado" traduzido. A sessão viva mora na secondary side bar da aba; o histórico volta ao web pela view Sessões do [plano 08](../08-claude-panel/README.md) |

`folder` ausente em `/workbench` cai na boas-vindas, não num erro. O callback do login
(`CALLBACK_PATH`) não muda — voltar ao link pedido depois do login continua valendo para todas.

---

## Cenários cobertos

S-01, S-02, S-04, S-06, S-07, S-164, S-165.

S-03, S-05 e a metade "removidas" do S-06 dependem de produto das fases seguintes — a boas-vindas, as
abas no servidor e a remoção das rotas antigas — e foram para a [F2](F2-open-folder.md) (B-16), a
[F3](F3-layout.md) (B-20) e a [F5](F5-screens.md) (B-33, no S-150), pela
[D-18](decisions.md#d-18--os-cenários-de-rota-que-dependem-de-produto).

---

## Critério de conclusão

```bash
pnpm verify
pnpm docs:check
```
