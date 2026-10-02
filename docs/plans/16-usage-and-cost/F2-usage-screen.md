# F2 — Tela de uso

Plano: [16 — Uso e custo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-usage-backend.md), e do plano [06](../06-workbench/README.md) entregue —
navegação global, moldura de tela com gaveta de ajuda, registro de comandos e atalhos, status bar.
**Entrega:** a tela "Uso e custo" responde "quanto, onde e com o quê" — cartões, gráfico diário por
modelo, tabelas por pasta, sessão, conversa e modelo, filtros na URL, detalhe com turnos, export,
limites da conta —, com ajuda escrita para quem nunca viu o produto.

**Decisões que bloqueiam:** [D-11](decisions.md#d-11--com-o-que-o-gráfico-é-desenhado) (B-16),
[D-04](decisions.md#d-04--moeda) (B-15), [D-08](decisions.md#d-08--o-que-se-mostra-das-sessões-externas) (B-22).

Regras de tela que valem para todas as tasks e não se repetem abaixo: cadeia
`Component → Hook → Service → api.ts` ([web/01](../../architecture/web/01-architecture.md)), os
[quatro estados](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre), zero
string literal ([02-i18n](../../architecture/shared/02-i18n.md)), token semântico em vez de cor
([web/03 · Tema](../../architecture/web/03-ui-system.md#tema)),
[acessibilidade](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) e
[responsividade](../../architecture/web/03-ui-system.md#responsividade). Cada task entrega unit
(componentes e formatadores), integração (tela com MSW) e alimenta o e2e da F4.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-14 — Feature `usage`: service, hooks e o vínculo com o stream 🔲

`web/src/features/usage/` com `services/usage.service.ts` sobre o `api.ts`, `usageKeys` hierárquicas
([web/04](../../architecture/web/04-state-and-data.md#chaves-hierárquicas-em-um-lugar-só)) e um hook
por consulta. `staleTime` de 30 s; **invalidação** de `usageKeys.all` quando um `turn.completed` é
observado em qualquer sessão que o web acompanha (S-67), com os eventos em rajada coalescidos numa
revalidação por consulta (S-68). Rota carregada sob demanda — o gráfico não pesa no bundle das outras
telas.

### B-15 — Cabeçalho e cartões 🔲

A tela dentro da moldura do plano 06: título, uma linha de propósito ("quanto o Claude custou, onde
e com o quê") e o botão da ajuda. Cartões **Hoje**, **Últimos 7 dias**, **Este mês**: custo,
tokens, turnos e a variação sobre o período anterior — anterior zero mostra "novo", nunca infinito
(S-69). Rodapé do resumo com o recorte ("só sessões abertas por aqui", D-08) e o fuso em uso, com
link para trocá-lo.

Moeda formatada por `Intl.NumberFormat` no idioma ativo, USD sempre; gasto real abaixo de um centavo
mostra "< US$ 0,01" (S-81); com taxa manual configurada, o valor aproximado aparece menor, ao lado,
rotulado. Conta de assinatura (Pro/Max): aviso de que o custo é equivalente a preço de lista e que o
que limita são os limites de uso, com link para o painel da B-21 (S-70). Skeleton com a forma dos
cartões (S-66).

### B-16 — Gráfico diário empilhado por modelo, acessível e ciente do tema 🔲

Barras por dia (semana ou mês quando o período passa de 90 dias ou de 2 anos), empilhadas por
modelo, com métrica alternável custo / tokens. Implementação conforme
[D-11](decisions.md#d-11--com-o-que-o-gráfico-é-desenhado). **Exigências da tarefa**, que valem
qualquer que seja a biblioteca:

- **Ciente do tema:** as cores dos modelos são tokens (`--chart-1…n`) definidos em `:root` **e**
  `.dark` ([web/03 · Tema](../../architecture/web/03-ui-system.md#tema)), atribuídas por ordem
  estável de modelo (o mesmo modelo tem a mesma cor em toda a tela e entre visitas); trocar o tema
  recolore sem recarregar e sem cor literal no JSX (S-71);
- **Contraste:** cada segmento atinge 3:1 contra o fundo e há separação visível entre segmentos
  vizinhos nos dois temas; texto de eixo e de rótulo em AA 4,5:1 (S-74);
- **Não só cor:** legenda sempre visível com o nome do modelo, a ordem do empilhamento igual à da
  legenda, tooltip com modelo, valor e total do dia; "outros" agrupa o que passar de N modelos;
- **Teclado e leitor de tela:** cada dia focável em ordem, foco visível, o valor e a composição
  anunciados; o gráfico tem nome e um resumo textual ("de 1 a 26 de setembro, US$ 42,10; maior dia
  23/09 com US$ 6,80, a maior parte Opus"); alternar **"ver como tabela"** mostra os mesmos números
  numa tabela semântica (S-72);
- **Movimento:** `prefers-reduced-motion` desliga animação (S-73);
- **Responsivo:** sem scroll horizontal; em tela estreita, menos rótulos no eixo e barra mínima de
  alvo tocável; o tooltip abre por toque;
- **Estados:** skeleton com a forma do gráfico, vazio que ensina, erro traduzido com "tentar de
  novo"; dia sem uso aparece como zero, nunca some;
- axe sem violação nos dois temas, no teste de integração e no e2e (S-74, S-122).

Clicar num dia filtra a tela para aquele dia; clicar num modelo na legenda o isola.

### B-17 — Tabelas por pasta, sessão, conversa e modelo 🔲

Uma aba por dimensão, tabela densa com colunas: nome (pasta com o caminho abreviado e completo no
tooltip; conversa com título; sessão com início e modelo), turnos, entrada, saída, leitura e escrita
de cache, cache hit, custo, custo médio por turno, última atividade. Ordenação por qualquer coluna com
`aria-sort`, busca por nome, paginação por cursor com "carregar mais", densidade (S-77). Ações de
linha pelo botão e pelo menu de contexto: filtrar a tela por esta linha, abrir a pasta no workbench
(aba de pasta do 06), abrir a conversa no histórico/painel do 08, ver detalhe. Abaixo de `md`, a
tabela vira lista com nome, custo e turnos, e o resto no detalhe (S-86).

### B-18 — Filtros 🔲

Período com presets (hoje, ontem, 7 dias, 30 dias, este mês, mês anterior, personalizado) e seletor
de datas que mostra o fuso; modelo (seleção múltipla, das facetas); pasta (das facetas, com busca);
granularidade. Tudo na search da URL — colar o link reproduz a tela, e reaplicar o mesmo filtro não
empilha histórico (S-75). Validação inline antes de enviar: `from` depois de `to`, intervalo acima do
teto (S-76). "Limpar filtros" sempre visível quando há filtro. Os chips dos filtros ativos ficam no
topo, removíveis um a um.

### B-19 — Detalhe de sessão e de conversa 🔲

Painel lateral (rota própria, abre também por link): cabeçalho com pasta, conversa, modelo(s),
início, fim e dono; totais, cache hit, custo médio; gráfico acumulado pequeno; lista de turnos
(instante, duração, modelos com tokens por tipo, custo, desfecho — sucesso, erro, teto de orçamento
do SDK, interrompido) com a **base** explicada em frase: "exato", "o acumulado recomeçou (`/clear`)",
"resultado zerado pelo CLI", "custo desconhecido — primeiro turno depois de continuar uma conversa
de fora" (S-78). Detalhe de outra pessoa ou inexistente → estado de erro traduzido com caminho de
volta (S-87).

### B-20 — Exportar CSV 🔲

Botão "Exportar" no cabeçalho, comando na palette, nível por turno ou por dia, usando os filtros
correntes; download pelo navegador com o nome do arquivo que o backend dá; estado de progresso que
não bloqueia a tela; recusa `USAGE_EXPORT_TOO_LARGE` traduzida com a ação "exportar por dia" (S-79).

### B-21 — Painel de limites da conta 🔲

Bloco próprio: cada janela (5 horas, 7 dias, 7 dias Opus/Sonnet, overage) com barra acessível de
utilização, estado (dentro, perto, bloqueado), reset relativo ("em 2 h 10 min") e absoluto no fuso,
e "visto às HH:MM" — nunca finge tempo real (S-80). Conta sem limites de plano: explica que o limite
não se aplica e por quê. Rótulo "conta do Claude desta máquina, compartilhada por quem usa o
produto nela".

### B-22 — Usabilidade e ajuda da tela de uso 🔲

A task de usabilidade exigida pelos princípios do produto, com cenários próprios:

- **Gaveta de ajuda** (moldura do 06), seções: o que é token; entrada, saída, leitura e escrita de
  cache — e por que cache lido custa menos; o que é "cache hit" e o que um número baixo sugere; o custo
  é **estimativa do SDK** a preço de lista ou contratado, não fatura; conta de assinatura versus chave
  de API; o que entra (sessões abertas por aqui, subagentes, compactação) e o que **não** entra
  (conversas do VS Code ou do terminal, nenhum texto de mensagem é gravado); a que dia pertence um
  turno e o fuso; retenção; o que significa cada base de custo (S-83);
- "saiba mais" em cada bloco abrindo a seção certa; **tooltip** e `aria-label` traduzidos em todo
  controle de ícone (S-84);
- **estado vazio que ensina**: sem nenhum turno, explica que o uso aparece depois do primeiro prompt
  e leva ao workbench; com filtro que zera, oferece limpar o filtro;
- **erros** que dizem o que fazer (período longo demais → "encurte ou agrupe por semana");
- **atalhos e palette**: "Uso: abrir", "Uso: exportar CSV", "Uso: novo orçamento", "Uso: ver como
  tabela", registrados no registro do 06 e editáveis no editor de atalhos (S-85);
- en e pt-BR, `i18n:check` e `lint` sem literal (S-82); foco e teclado em toda a tela; axe sem
  violação.

---

## Cenários cobertos

S-66…S-87.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
