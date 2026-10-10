# F2 — Markdown compartilhado

Plano: [26 — Paridade da conversa no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-parity-map.md); a [D-10](decisions.md#f0--spike) (motor de realce) decidida; o
[plano 28 — Núcleo neutro de agente](../28-agent-neutral-core/README.md) concluído, como as F3…F7
([D-15](decisions.md#normas)).
**Entrega:** o renderizador de markdown do app mora em `core/widgets/markdown/` e serve ao leitor de
arquivos e à conversa. O bloco de código tem realce, copiar, rótulo da linguagem e rolagem própria.

---

## Por quê

O renderizador seguro do [plano 25](../25-mobile-file-browser/F4-markdown.md) está preso à feature
`files`: o `MarkdownViewer` recebe `folder`, `path` e os controllers do leitor. A
[mobile/02-folder-structure](../../architecture/mobile/02-folder-structure.md) manda o widget usado
por duas features para `core/widgets/`. Copiar o renderizador para a sessão daria duas regras de
segurança, que acabariam divergindo.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-07 — O renderizador em `core/widgets/markdown/` 🔲

Vão para `core/widgets/markdown/`:

- as sintaxes (`markdown_syntaxes.dart`);
- o bloco `mermaid` (`mermaid_block.dart`), sobre o **mesmo** `DiagramEngine`;
- a regra de link (`open_link.dart` e a confirmação);
- a regra de imagem: remota vira texto e endereço; relativa é resolvida por quem chama, por callback.

Um widget novo, `SafeMarkdown`, recebe:

- o texto;
- um `onRelativeLink` opcional;
- um `imageResolver` opcional;
- um `codeBuilder` opcional.

Ele não conhece arquivo, pasta nem sessão.

O `MarkdownViewer` do leitor passa a montar o `SafeMarkdown` com a pinça, a lista preguiçosa e as
imagens relativas dele. O comportamento não muda. Os testes do plano 25 rodam **sem edição** (R-03).
O teste de arquitetura do app ganha uma regra: `core/` não importa `features/`. Cenários S-17…S-21.

### B-08 — O bloco de código 🔲

`core/widgets/markdown/code_block.dart`, o par do `CodeBlock` do web:

- caixa com rolagem horizontal própria, nunca a da página (a S-83 do plano 25);
- rótulo da linguagem pela mesma tabela de cerca do web (`languageOfFence`);
- botão copiar, com o retorno "copiado" anunciado ao leitor de tela;
- **realce** pelo motor da D-10, com as cores dos **mesmos** tokens de tema do `colorizeCode` do web.
  A tabela escopo → token fica num arquivo só, com um teste que compara as linguagens cobertas com a
  lista do web.

Linguagem desconhecida ou bloco acima do teto da B-03 sai sem realce, com o mesmo texto. O
"inserir no editor" do web é exclusão nomeada no mapa (D-11). O leitor de arquivos ganha o realce
também, o que é paridade com a prévia do web. Cenários S-22…S-26.

---

## Cenários cobertos

S-17…S-26.

---

## Critério de conclusão

```bash
pnpm verify
pnpm render:check     # as entradas de código e dos nós de markdown deixam de ser `pending`
```
