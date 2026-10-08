# F7 — E2E

Plano: [25 — Navegador de arquivos no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** todas as fases anteriores. As decisões da fase ([D-16, D-21](decisions.md#f7--e2e))
estão tomadas.
**Entrega:** o painel, cada leitor, o download e o pedido de permissão com o leitor aberto provados no
emulador pela pilha real do `run-e2e-local`, e o plano fechado com os portões completos.

Leia antes: [06-testing-strategy §E2E](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário)
e [mobile/06](../../architecture/mobile/06-testing.md).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-29 — A pasta de fixture 🔲

Em `mobile/integration_test/fixtures/`: um markdown com tabela larga, link relativo, os oito tipos de
`mermaid` e um inválido; um texto longo; um PDF de várias páginas; uma imagem; um binário; um arquivo
oculto. O helper do e2e (`e2e_environment.dart`) monta a pasta com `makeFolder` e envia os arquivos
que não são texto pelo `/files/upload` ([D-21](decisions.md#f7--e2e)).

### B-30 — O `files_test.dart` 🔲

`mobile/integration_test/files_test.dart`, com seletores num robô em `integration_test/support/`, como
a tela de sessão:

- de dentro de uma sessão, abrir o painel, navegar, voltar pela migalha e abrir cada tipo no leitor
  certo; alternar a quebra; alternar prévia ↔ fonte e ver os diagramas desenhados pelo motor real, e o
  inválido com a mensagem; o PDF pelo `pdfrx` de verdade, com o indicador de página;
- "voltar" devolve a sessão intacta, com o stream seguindo;
- um pedido de permissão que chega com o leitor aberto mostra a faixa, e "voltar à sessão" mostra o
  card (R-01);
- baixar pelo leitor com o `FileSaver` fake ([D-16](decisions.md#f7--e2e)) sobre o HTTP real, e a
  trilha com `file.downloaded`;
- o mesmo painel na `FolderPage`, sem sessão aberta;
- com o aparelho ainda pendente, o painel pede a aprovação; o helper aprova pelo navegador e a árvore
  aparece — é aqui que o `azp` do Keycloak de verdade é provado (S-153).

### B-31 — Os portões completos 🔲

`pnpm verify:full` e `pnpm test:e2e:mobile` — o portão 9 do `verify:full` só roda o e2e do web. Antes,
conferir se outra sessão está rodando validação na mesma árvore (R-13).

---

## Cenários cobertos

S-135…S-142, S-153.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
```
