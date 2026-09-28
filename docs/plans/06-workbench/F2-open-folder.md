# F2 — Abrir pasta (web)

Plano: [06 — Workbench](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-directory-browse.md).
**Entrega:** a tela de boas-vindas no molde do VS Code — Abrir pasta, Recentes, as raízes —, o
diálogo que navega pelas raízes liberadas, a pasta na URL, e um `/workbench`
ainda mínimo em que a sessão do Claude nasce **na pasta escolhida**. Ao fim desta fase o caso
relatado está resolvido, mesmo antes da casca do workbench existir.

---

## Por quê

A casca de painéis (F3) é o que o usuário vê; esta fase é o que ele **usa** para chegar lá. Fazê-la
antes deixa a F3 construir sobre uma pasta que já vem validada da URL, em vez de montar o layout
sobre um store global de "workspace selecionado" — exatamente o desenho que levou a sessão para o
`/tmp`.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-13 — Service e hooks de pastas na feature `workspace` 🔲

A cadeia [Component → Hook → Service → `api.ts`](../../architecture/web/01-architecture.md#os-quatro-elos):
`workspace.service` ganha `listDirectories`, `listRecent`, fixar/remover recente e as pastas
abertas, que ficam no servidor ([D-10](decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas)); os hooks
`useDirectories`, `useRecentFolders`, `useOpenFolders` sobre TanStack Query, com chaves hierárquicas no lugar único
([web/04](../../architecture/web/04-state-and-data.md#chaves-hierárquicas-em-um-lugar-só)).

Navegar rápido pelo diálogo dispara vários pedidos: o que chega depois do pedido seguinte é
descartado (chave por caminho, e o `signal` do Query cancela o anterior) — a tela nunca mostra a
pasta errada por ordem de chegada.

### B-14 — Tela de boas-vindas 🔲

Em `/`, quando não há aba aberta ([D-07](decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)):

- **Abrir pasta…** (abre o diálogo da B-15), com o atalho à vista;
- **Recentes**: fixados primeiro; a indisponível marcada como tal, sem link, com o motivo; fixar,
  desafixar e remover pelo botão da linha, pelo menu de contexto e pelo teclado; busca na lista
  quando ela passa de uma tela;
- **Raízes liberadas**: um clique abre o diálogo já dentro dela;
- quando a única raiz é a de scratch (o caso relatado), a tela **diz como liberar o projeto**: o
  comando `pnpm allowlist add <caminho>` copiável, e que ele roda na máquina do backend. A
  allowlist continua só leitura na UI — mudá-la exige acesso ao disco, e essa é a razão de existir
  ([backend/03](../../architecture/backend/03-modules.md#workspace));

Os quatro estados ([web/03](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre));
zero string literal ([i18n](../../architecture/shared/02-i18n.md)).

### B-15 — Diálogo "Abrir pasta" 🔲

Sobre o `Dialog` do shadcn (foco preso, `Esc` fecha):

- **raízes no topo**; entrar numa raiz lista as subpastas (B-08); **breadcrumb** clicável que nunca
  sobe acima da raiz (`parent: null`);
- **teclado** completo, no padrão ARIA de listbox: setas, `Enter` entra, `Backspace`/`Alt+↑` sobe,
  digitar filtra por prefixo; o botão **Abrir** abre a pasta corrente, sem exigir entrar numa
  subpasta;
- **mostrar ocultas** refaz a listagem ([D-04](decisions.md#d-04--ocultas-pastas-pesadas-e-symlinks-no-seletor));
- `truncated: true` → aviso de que a lista foi cortada e o filtro por prefixo pedido ao servidor
  ([D-05](decisions.md#d-05--teto-de-entradas-por-listagem));
- symlink marcado com ícone e rótulo acessível; subpasta ilegível mostra
  `WORKSPACE_DIRECTORY_UNREADABLE` traduzido, sem fechar o diálogo;
- quatro estados — skeleton com a forma da lista, erro com "tentar de novo", vazio que explica;
- ajuda do diálogo: por que só aparecem as raízes liberadas e como acrescentar uma.

### B-16 — A pasta na URL, e a sessão que nasce nela 🔲

`/workbench?folder=<path>` ([D-06](decisions.md#d-06--a-url-do-workbench)):

- a pasta da URL é **resolvida** (`GET /workspaces/resolve`) antes de qualquer coisa; o caminho que
  segue adiante é o **real** que o servidor devolveu;
- fora da allowlist, inexistente ou arquivo → estado de erro traduzido
  (`WORKSPACE_NOT_ALLOWED`, `WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY`) com **caminho de
  volta**: boas-vindas e "Abrir outra pasta";
- abrir grava o recente e a pasta aberta, no servidor (D-10);
- até a F3, o `/workbench` é mínimo: o nome da pasta e o `SessionStarter` de hoje **preso à pasta
  da URL**. A sessão nasce com `workspacePath` = a pasta — **nunca** a primeira raiz por default. O
  `useWorkspaceStore.selected` deixa de ser a origem do `workspacePath` da sessão (e some de vez na
  B-33).

---

## Cenários cobertos

S-69…S-85.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
