# F7 — As pastas abertas no app

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F5](F5-connection-address.md). Do lado do servidor, nada novo: as pastas abertas e as
recentes são as do [plano 06](../06-workbench/README.md) (`/workspaces/open-folders`,
`/workspaces/recent`, `/workspaces/directories`), e as sessões vivas de cada pasta, o
`GET /sessions?workspacePath=` do [plano 08](../08-claude-panel/F1-sessions.md).
**Entrega:** o app abre na tela **Pastas**: as pastas abertas no alto, as mesmas das abas do web, cada
uma com quantas sessões estão abertas nela e quantos pedidos esperam; as recentes abaixo; e "Abrir
outra pasta", que navega pelas raízes até a pasta e a abre.

**Decisões que precisam estar fechadas para começar:** [D-24…D-28](decisions.md#f7f9--pastas-e-sessões-no-app),
fechadas em 2026-10-04.

---

## Por quê

Hoje o app abre na tela do esqueleto (o ping) e lista as **raízes** da allowlist; tocar numa raiz abre
o rascunho. Não há como ter mais de uma pasta à mão, nem ver o que já roda em cada uma. O web tem as
abas de pasta desde o plano 06, guardadas no servidor; o app passa a ler e escrever a mesma lista
([D-25](decisions.md#f7f9--pastas-e-sessões-no-app)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-38 — Pastas abertas, recentes e o seletor, do lado do app ✅

Na feature `workspace`: data source, mapper, repositório e casos de uso de
`GET/POST/DELETE /workspaces/open-folders`, `GET /workspaces/recent`, `PUT /workspaces/recent/pin`,
`DELETE /workspaces/recent` e `GET /workspaces/directories`. Entidades `OpenFolder` (caminho, rótulo da
raiz, estado `available`/`notAllowed`/`missing`), `RecentFolder` e `DirectoryListing`. Todo erro vira
`Failure` com o `code` do catálogo — `OPEN_FOLDERS_LIMIT_REACHED` com o teto, `WORKSPACE_*` com o
motivo. O cliente HTTP já loga as duas bordas.

### B-39 — A tela Pastas ✅

A rota inicial do app passa a ser **Pastas** (o esqueleto do ping sai do caminho e fica alcançável pelo
diagnóstico). A tela tem:

- **Abertas**: as pastas abertas, na ordem das abas do web. Cada linha: o nome, o caminho abaixo da raiz,
  o estado (uma pasta `missing` ou `notAllowed` aparece marcada, com o motivo, e não abre), e, à
  direita, quantas sessões estão abertas nela e quantos pedidos esperam (B-40). Tocar abre a pasta
  ([F8](F8-folder-screen.md)). "Fechar" (menu da linha) tira a aba — diz que **nenhuma sessão é
  encerrada**.
- **Recentes**: as recentes que não estão abertas, fixadas primeiro. Tocar abre (vira aba). Fixar e
  esquecer pelo menu da linha.
- **Abrir outra pasta**: o seletor — as raízes, e dentro de cada uma as subpastas, um nível por vez
  (`GET /workspaces/directories`), com "Abrir esta pasta". No teto de pastas abertas, a recusa diz o
  teto e que fechar uma resolve.
- A barra mantém regras, endereço, diagnóstico e sair; a ajuda da tela explica abertas, recentes e o
  seletor, e que a lista é a mesma do navegador.

Os quatro estados de tela (carregando, erro com tentar de novo, vazio, conteúdo), puxar para atualizar,
e tudo pelo ARB nos dois idiomas.

### B-40 — Quanto roda em cada pasta aberta ✅

Para cada pasta aberta, `GET /sessions?workspacePath=` (o da [B-41](F8-folder-screen.md)): o número de
sessões vivas e a soma de `pendingPermissions`. Pedidas em paralelo, ao abrir a tela, ao voltar a ela e
ao puxar; uma pasta cuja contagem falhou mostra "—" com o motivo no toque, sem derrubar a lista.

---

## Cenários cobertos

S-141…S-152.

## Critério de conclusão

```bash
pnpm verify:full    # portões 1-11, sai com código 0 (o e2e destas fases é a B-48, na F10)
```
