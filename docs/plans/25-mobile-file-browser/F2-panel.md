# F2 — Painel de arquivos

Plano: [25 — Navegador de arquivos no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-norms.md), e das decisões [D-01, D-02 e D-03](decisions.md#f2--painel-de-arquivos)
(lado, ícone, e o critério do número de ícones) — tomadas; a D-02 fecha com a captura da B-10.
**Entrega:** de dentro de uma sessão ou da `FolderPage`, um botão no molde do das sessões abre a
barra lateral de arquivos; nela se navega pela pasta, um nível por vez, com migalha, ocultos, symlink
marcado e `truncated`. Tocar num arquivo ainda não abre nada — o leitor é a [F3](F3-text-viewer.md).

Leia antes: [mobile/01](../../architecture/mobile/01-architecture.md),
[mobile/03](../../architecture/mobile/03-state-and-data.md) e [mobile/04](../../architecture/mobile/04-ui.md).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-09 — Os dados da árvore ✅

- `domain/`: `FileEntry` (nome, `kind`, tamanho, `mtime`, `hidden`, `outside`, `targetKind`),
  `FileListing` (com `truncated`) e `visibleEntries`, que filtra os ocultos sem mudar a ordem do
  servidor. Dart puro.
- `data/`: `FilesApiDataSource.tree` e `.limits`, só `GET`, com `folder` e `path` na query; os mappers;
  `403`, `404` e `WORKSPACE_NOT_ALLOWED` para `Failure`. Log `debug` na entrada e na saída, sem conteúdo
  ([mobile/05](../../architecture/mobile/05-logging.md)).
- O `FilesRepository` e o provider da árvore **por pasta**, `keepAlive`, para o painel reabrir onde
  estava (S-39) e ser o mesmo na sessão e na `FolderPage` (S-45).
- Teste de integração contra um `HttpServer` local: Bearer no cabeçalho, nunca na URL; nome com
  acento, espaço, emoji e 255 bytes.

### B-10 — O botão e a barra lateral ✅

- `core/widgets/app_screen.dart`: o parâmetro `endDrawer` (pela [D-01](decisions.md#f2--painel-de-arquivos)),
  com a mesma regra do `drawer`: abre pelo botão, nunca pelo deslizar da borda, porque as duas bordas
  são o "voltar" do Android ([10 · D-26](../10-mobile-chat-layout/decisions.md#f7f9--pastas-e-sessões-no-app)).
- `FilesPanel.button`, no molde do `FolderSessionsPanel.button`: ícone *outlined* de 24 dp
  ([D-03](decisions.md#f2--painel-de-arquivos)), tooltip traduzido, alvo de 48 dp, escondido enquanto
  `workspacePath` é nulo.
- A `SessionPage` ganha o botão e o painel. O `session_header_test` passa de 3 para o número que a
  [D-02](decisions.md#f2--painel-de-arquivos) fixar, e a captura de 360 dp com fonte em 200 % fica no
  `progress.md`.

### B-11 — O painel ✅

`presentation/widgets/files_panel.dart`: título, `⋮` (mostrar ocultos, atualizar), migalha com cada
trecho tocável, ".." fora da raiz, pastas primeiro, linha com ícone por tipo, nome e tamanho. Symlink
para fora e quebrado marcados e inertes, com o porquê. Faixa de `truncated`. Os quatro estados; no de
erro, o aparelho pendente e o revogado ([B-32](F1-norms.md#b-32--aparelho-aprovado-para-ler-a-pasta-))
têm mensagem própria, que diz o que fazer. Puxar para atualizar. Largura de até 85 % da tela, no máximo 400 dp. Medido em 360×640 e 360×400 com fonte
em 200 %, com os `meetsGuideline`.

### B-12 — Ações do item ✅

Toque longo abre uma folha (`showSheet`) com **copiar caminho relativo**, e a mesma ação como ação de
`Semantics` da linha ([mobile/04](../../architecture/mobile/04-ui.md)). A folha nasce aqui para
receber **baixar** na [F6](F6-download.md).

### B-13 — O painel na `FolderPage` ✅

O mesmo botão e o mesmo painel na `FolderPage` ([D-05](decisions.md#f2--painel-de-arquivos)), sem
sessão aberta. O estado é o da pasta, então os dois lugares mostram o mesmo nível.

---

## Cenários cobertos

S-18…S-45, S-152.

---

## Critério de conclusão

```bash
pnpm verify
```
