# F3 — Leitor de texto e de imagem

Plano: [25 — Navegador de arquivos no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-panel.md), e da decisão [D-09](decisions.md#f0--spike-dos-motores) (o teto de
texto), fechada na F0.
**Entrega:** tocar num arquivo do painel abre o leitor numa rota empilhada. Texto abre virtualizado,
com quebra de linha ligável e pinça na fonte; imagem abre com zoom e arrasto; o que não abre diz por
quê; o arquivo que mudou é recarregado sem perder a posição; e um pedido de permissão que chega com o
leitor aberto aparece numa faixa. Markdown e PDF abrem, por ora, como texto e como "sem prévia" — as
prévias são a [F4](F4-markdown.md) e a [F5](F5-pdf.md).

Leia antes: [mobile/04](../../architecture/mobile/04-ui.md) e
[shared/04-errors-and-http](../../architecture/shared/04-errors-and-http.md).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-14 — A rota e a regra do leitor ✅

- `domain/services/viewer_for.dart`: a regra pura da [discovery §7.1](../../discovery/07-navegador-de-arquivos-no-app.md#71-qual-leitor-abre)
  — a extensão escolhe, o `Content-Type` do servidor confirma, e um `.pdf` que não é PDF nunca chega
  ao motor. SVG é texto ([D-08](decisions.md#f3--leitor-de-texto-e-de-imagem)).
- `FilesApiDataSource.content` e `.raw` (só `GET`), o `TextDocument` com `encoding`, `eol`, `size`,
  `largeFile` e o `ETag`.
- `core/navigation/routes.dart` e `app/router.dart`: `/files/view?folder=&path=` e
  `viewerRouteFor(folder, path)`. A pasta e o caminho na query, como as outras rotas (proxies
  normalizam `%2F` no caminho).
- `presentation/pages/file_viewer_page.dart`: barra com o nome, o caminho relativo no subtítulo e o
  `⋯` com as opções do tipo. Dois toques rápidos empilham uma rota só (S-52).

### B-15 — O texto ✅

`widgets/viewers/text_viewer.dart`: monoespaçado, números de linha, **linhas virtualizadas** (um
`Text` com o arquivo inteiro trava o celular), quebra ligável no `⋯` e lembrada para todos os
arquivos ([D-17](decisions.md#f3--leitor-de-texto-e-de-imagem)), rolagem nas duas direções com a
quebra desligada. "Copiar tudo" no `⋯` e seleção nativa onde a virtualização permitir. Faixa de
`largeFile`; acima do teto da [D-09](decisions.md#f0--spike-dos-motores), "grande demais para abrir
no celular".

### B-16 — A pinça no texto ✅

A pinça muda o tamanho da fonte, de 50 % a 300 %, e as linhas se refazem — é o "zoom de texto" do
navegador, e mantém a virtualização ([D-07](decisions.md#f3--leitor-de-texto-e-de-imagem)). O
tamanho vale enquanto o leitor está aberto, não por arquivo.

### B-17 — A imagem ✅

O leitor de imagem da tela cheia do prompt (`session/.../image_marker.dart`) é extraído para
`core/widgets/zoomable_image.dart` — `InteractiveViewer` sobre `Image.memory`, com carregando, erro e
"tentar de novo" — e usado pelos dois. Extrair, e não copiar: o portão de duplicação reprova o
contrário. Os bytes vêm por `/files/raw` com Bearer.

### B-18 — Erros, recarga e a faixa da permissão ✅

- `widgets/viewers/no_preview.dart`: "sem prévia" (`415` de binário), "codificação não reconhecida"
  (`415` de codificação), "grande demais" (`413`, com o tamanho), "não encontrado" (`404`) e "acesso
  negado" (`403`). O **baixar** desses estados entra na [F6](F6-download.md).
- Recarga com `If-None-Match` ao voltar do fundo, ao voltar de outra tela e pelo "atualizar" do `⋯`
  ([D-15](decisions.md#f3--leitor-de-texto-e-de-imagem)). `304` não reconstrói; `ETag` novo troca o
  conteúdo mantendo a posição, com a faixa "o arquivo mudou". Duas recargas seguidas: vale a do pedido
  mais novo (S-77).
- A faixa "o Claude está esperando", com "voltar à sessão", quando a sessão de onde o leitor foi
  aberto tem um pedido de permissão pendente ([D-11](decisions.md#f1--normas-e-a-sessão-encoberta)
  (b)). O leitor lê a fila pelo barril de `permission`; o stream da sessão segue embaixo (S-79).

---

## Cenários cobertos

S-46…S-79.

---

## Critério de conclusão

```bash
pnpm verify
```
