# F2 — Consulta da trilha

Plano: [03 — Regras e trilha](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-rules-ui.md).
**Entrega:** a trilha que o [plano 01](../01-live-session/F3-audit.md) passou a escrever agora
pode ser lida — com filtro, paginação estável e ligação com o que aconteceu.

---

## A pergunta que esta fase responde

**"O que foi executado na minha máquina sem me perguntar?"**

Com regras persistidas existindo desde a F0, essa pergunta deixa de ser teórica. Sem resposta,
a regra vira um cheque em branco.

`audit` continua **write-only para os outros módulos** — o que nasce aqui é uma porta de
leitura própria, do lado de fora do fluxo ([backend/03](../../architecture/backend/03-modules.md#audit)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-11 — Endpoint de consulta 🔲

Filtro por sessão, tool, decisão e período; paginação **por cursor**, não por offset — offset
repete e pula linha quando a tabela cresce durante a leitura, e esta cresce o tempo todo.

O cursor é **keyset descendente sobre `seq`**, o sequencial próprio da tabela
([D-06](decisions.md#d-06--paginar-sobre-o-tempo)); `at` continua sendo o que os filtros de
período usam, e deixa de ser a ordenação. Descendente é o que torna o S-25 verdadeiro: escrita
nova só entra **acima** da janela já lida, nunca dentro dela.

### B-12 — Autorização da leitura 🔲

Cada usuário lê a própria trilha. Trilha de outro devolve `404`, não `403` com detalhe: o
`404` é para "não existe, ou você não pode saber que existe"
([04-errors-and-http](../../architecture/shared/04-errors-and-http.md)).

A consulta nunca devolve conteúdo de arquivo lido pela tool `Read` — a trilha guarda `path` e
tamanho, e é isso que sai.

### B-13 — Tela da trilha no web 🔲

Filtros, lista e o detalhe com o `input` exato da tool. Os quatro estados, i18n completo.

### B-14 — Índices desenhados com a consulta 🔲

Índice que serve ao filtro real, desenhado sobre a ordenação da D-06 — `(user_id, seq DESC)` e
`(session_id, seq DESC)`, com `at` como coluna de filtro —, verificado com plano de execução.
Consulta que varre a tabela inteira funciona no primeiro mês e deixa de funcionar no sexto.

### B-15 — Correlação: da trilha ao que aconteceu 🔲

De uma entrada da trilha se chega à sessão, ao `traceId` no log e — quando houve pergunta — à
decisão, com `resolvedBy`. Quando não houve, à **regra** que resolveu, com `auto: true`.

É essa ligação que transforma a trilha em resposta, em vez de lista. E ela é navegável: da
entrada auto-resolvida se **abre** a regra (S-50), inclusive quando já foi revogada — aí a tela
explica o estado, em vez de devolver um vazio sem motivo. É o segundo ponto de entrada que a
[D-04](decisions.md#d-04--onde-a-revogação-mora) exige.

---

## Cenários cobertos

S-23…S-32, S-50.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
