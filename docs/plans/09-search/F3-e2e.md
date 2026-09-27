# F3 — E2E

Plano: [09 — Busca](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-search-ui.md).
**Entrega:** a busca provada pela porta do usuário — API e web —, inclusive as tentativas de injeção,
o prazo, o abort, e o Claude roteirizado escrevendo entre a prévia e a aplicação.

**Por quê uma fase própria:** os cenários que mais importam aqui atravessam o sistema inteiro — um
nome de arquivo hostil que sai do disco, passa pelo ripgrep, pelo JSON, pelo controller e chega à
árvore de resultados; uma escrita do Claude que acontece **entre** duas requisições. Nenhum teste de
integração isolado prova isso ([e2e](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-21 — A fixture: pasta gerada por execução, com nomes hostis 🔲

Como a [D-07 do plano 04](../04-transcript-and-resume/decisions.md#d-07--onde-o-init-pode-escrever):
gerada num diretório temporário **dentro da raiz de e2e da allowlist**, apagada no teardown, nunca um
diretório fixo e nunca o repositório do produto. Contém: nomes que começam com `-` (`-rf`,
`--output=x`, `--pre=sh`), com espaço, aspas, `*`, `\n` no nome, Unicode NFC e NFD, um nome não
representável em UTF-8; um `.gitignore` com `ignored/`; `.git/` com conteúdo que casaria a busca; um
symlink para fora da raiz; um binário; um arquivo acima do teto; uma linha minificada gigante; CRLF e
BOM; e um arquivo-sentinela que só existe se algo executar comando. Um gerador separado produz a pasta
grande (50 mil arquivos) para os cenários de teto e latência, fora do caminho rápido.

### B-22 — E2E da API 🔲

Playwright em modo API contra o backend real ([06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário)):
localizador (arquivos, pastas, `prefer`, ignorados, teto), busca (regex, caixa, palavra, multilinha,
include/exclude, só em caminhos), substituir (prévia → aplicar → disco → entradas `file.*` na trilha),
e as tentativas hostis — padrão `--pre=sh`, glob `--pre=x`, `$(touch sentinela)` no padrão e no texto
de substituição, glob com `..` — com o sentinela **ausente** no fim. Prazo estourado devolve parcial;
abort da requisição deixa zero processos `rg` órfãos; a terceira busca simultânea recebe `429`. Os
status de cada endpoint conferidos contra a tabela do contrato no `http-contract.spec.ts`.

### B-23 — E2E da web 🔲

Pela porta do usuário, no Playwright com o web buildado: Ctrl/Cmd+P → consulta → Enter abre o arquivo
no editor; `arquivo:42` abre na linha; view Busca com regex → clique abre na linha; "substituir tudo"
→ alcance → aplicar → o disco mudou → as entradas aparecem em `/audit`; editor de resultados abre,
reexecuta e salva `.code-search`; histórico pelas setas; a busca na URL sobrevive à recarga; viewport
de celular sem scroll horizontal; axe nas duas views e no Quick Open; ajuda aberta e traduzida nos
dois idiomas.

### B-24 — O Claude roteirizado e as abas de pasta 🔲

Com o backend roteirizado do [plano 04](../04-transcript-and-resume/README.md) — o fake que escreve
os arquivos que a gravação escreveu, no diretório da sessão —: o Claude escreve num arquivo **entre**
a prévia e o aplicar, e o arquivo é preservado e relatado; o desfazer daquele turno, depois do
substituir, preserva o arquivo alterado. E duas abas de pasta (pasta e subpasta) com buscas
diferentes: alternar não mistura consulta nem resultado, e o `@` do composer do
[plano 08](../08-claude-panel/README.md), quando existir, recebe arquivos e pastas do mesmo
localizador — se o 08 ainda não estiver pronto, esse passo fica como cenário do 08, registrado no
[progresso](progress.md).

---

## Cenários cobertos

S-148…S-162.

---

## Critério de conclusão

```bash
pnpm verify:full
```
