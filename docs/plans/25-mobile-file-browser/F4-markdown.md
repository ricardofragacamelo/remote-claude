# F4 — Markdown e Mermaid

Plano: [25 — Navegador de arquivos no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-text-viewer.md), e das decisões [D-06 e D-10](decisions.md#f0--spike-dos-motores)
(fechadas na F0), [D-18 e D-20](decisions.md#f4--markdown-e-mermaid).
**Entrega:** o markdown abre em prévia, com alternância para a fonte; links e imagens seguem a regra
de conteúdo não confiável; tabela larga rola na própria caixa; e os blocos `mermaid` viram diagrama,
desenhados sob demanda, com tela cheia para zoom.

Leia antes: [mobile/04](../../architecture/mobile/04-ui.md) (a regra de link da [B-05](F1-norms.md#b-05--as-normas-))
e [07 · D-18](../07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia).

F4, F5 e F6 dependem só da F3, e podem correr em qualquer ordem entre si.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-19 — A prévia ✅

`widgets/viewers/markdown_viewer.dart` sobre o motor da [D-06](decisions.md#f0--spike-dos-motores)
(`flutter_markdown_plus`, se o spike confirmar). Alternador prévia ↔ fonte na barra; a fonte é o
leitor de texto da [B-15](F3-text-viewer.md#b-15--o-texto-). HTML embutido aparece como texto, e
nenhum elemento sai dele. Tabela larga e bloco de código rolam na horizontal dentro da própria caixa.
A pinça muda o `textScaler`, de 50 % a 300 %, e a prévia continua refluindo para a largura da tela.

### B-20 — Links e imagens ✅

- `domain/services/resolve_relative_link.dart`: resolve o link contra o diretório do arquivo atual
  (`../`, `./`, `%20`, `#âncora`), e recusa o que sai da pasta antes de perguntar ao servidor.
- Link relativo abre o leitor daquele arquivo. `http`, `https` e `mailto` abrem uma confirmação que
  mostra o endereço, e só então o navegador do sistema, por `url_launcher` (dependência direta, apesar
  de vir pelo `pdfrx`). Qualquer outro esquema não abre.
- Imagem relativa por `/files/raw` com Bearer. Imagem remota **não** é carregada (rastreio e rede): no
  lugar, o texto alternativo com o endereço.

### B-21 — O motor de diagramas ✅

- `data/ports/diagram_engine.dart`: a porta — código, tema, largura e densidade → imagem, ou falha
  (sintaxe com a linha, teto, tempo). O adaptador é o motor da [D-10](decisions.md#f0--spike-dos-motores),
  na versão da [D-20](decisions.md#f4--markdown-e-mermaid), fixada exata. O fake da porta serve os
  testes de unit e de widget.
- Os tetos antes do motor: tamanho do código (50 000 caracteres, o `maxTextSize` do Mermaid) e
  *timeout* (5 s).
- Uma fila que desenha **sob demanda** — quando o bloco se aproxima da vista —, fora da thread de UI,
  um por vez, e um cache em memória por hash de código, tema e largura.
- Nenhuma rede, e nenhuma navegação a partir do diagrama: com o WebView, CSP `default-src 'none'`,
  `securityLevel: 'strict'` e navegação bloqueada; com o `merman`, não há rede a desligar. Provado no
  e2e (S-100).

### B-22 — O bloco `mermaid` ✅

`widgets/viewers/mermaid_block.dart`, ligado ao builder de código do markdown para a linguagem
`mermaid`: espaço reservado enquanto desenha, a imagem ajustada à largura depois, com rótulo de
`Semantics`. Erro de sintaxe mostra o código com "não foi possível desenhar o diagrama" e a linha;
acima do teto, o código com aviso. Tocar abre a tela cheia com `InteractiveViewer`, redesenhada em
resolução maior. Trocar o tema do app redesenha. Sem links nem texto selecionável no diagrama
([D-18](decisions.md#f4--markdown-e-mermaid)), e essa diferença do web fica escrita no
[mobile/04](../../architecture/mobile/04-ui.md).

---

## Cenários cobertos

S-80…S-106.

---

## Critério de conclusão

```bash
pnpm verify
```
