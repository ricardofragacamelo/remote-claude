# F4 — E2E

Plano: [21 — Rich previews](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-pdf-reader.md), [F2](F2-pdf-navigation.md), [F3](F3-markdown.md).
**Entrega:** o leitor, a navegação, as tabelas e os diagramas provados no navegador de verdade, contra o
build de produção, com acessibilidade e só pelo teclado.

**Decisões que precisam estar fechadas para começar:** D-15 ([decisions.md](decisions.md#f4--e2e)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-20 — O leitor pela porta do usuário ✅

Em `e2e/specs/rich-previews.spec.ts`, com os PDFs da [B-04](F0-norms.md) copiados para a pasta do teste:
abrir o `reader.pdf` pela árvore e ler rolando até a última página (S-69); o zoom mantém a página (S-15);
selecionar e copiar o texto (S-17); o link interno (S-18); o `locked.pdf` com a senha errada e depois a certa
(S-70).

### B-21 — A navegação pela porta do usuário ✅

O índice leva ao destino (S-34), a miniatura leva à página (S-40), e a busca conta, destaca e anda (S-44).

### B-22 — Tabelas e diagramas pela porta do usuário ✅

Uma prévia de markdown com a tabela de 7 colunas e o token longo (S-50, S-51) e com um diagrama (S-71). O
cenário roteirizado `rich-previews.json` ([D-15](decisions.md#f4--e2e)) traz uma resposta com tabela e
diagrama, desenhado quando a mensagem completa (S-72).

### B-23 — Acessibilidade e teclado ✅

axe sem violação no leitor com o painel e a busca abertos, e na prévia com tabela e diagrama (S-73). Só pelo
teclado: abrir o painel, andar pelo índice, buscar e dar zoom (S-74).

---

## Cenários cobertos

S-15, S-17, S-18, S-34, S-40, S-44, S-50, S-51, S-69…S-74.

---

## Critério de conclusão

```bash
pnpm verify:full
```
