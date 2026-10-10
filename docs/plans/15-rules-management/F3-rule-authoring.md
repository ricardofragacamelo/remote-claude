# F3 — Criação de regras

Plano: [15 — Gestão de regras](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-rules-screen.md); do [plano 06](../06-workbench/README.md), o seletor de
pasta (o diálogo "Abrir pasta" sobre `GET /workspaces/directories`); e da
[D-03](decisions.md#d-03--segundo-passo-e-step-up-ao-criar-pela-tela) e da
[D-19](decisions.md#d-19--rota-própria-para-o-assistente).
**Entrega:** criar regra pela tela — com prévia do que casa, teste de comando, simulação contra a
trilha e o alcance por extenso antes de gravar —, mais modelos, duplicar, exportar e importar.

---

## Por quê esta fase é a mais delicada da web

Até aqui, toda regra nascia de uma invocação real que alguém tinha na frente dos olhos, com o padrão
mais estreito que a cobria. Pela tela, a pessoa **escreve** o padrão. É o [R-01 do plano 03](../03-rules-and-audit/README.md)
em pessoa: a gramática deixa escrever largo, e a tela precisa mostrar o alcance real antes de gravar —
com o servidor recusando o que nenhuma tela deveria deixar passar ([D-09](decisions.md#d-09--o-que-é-largo-demais)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-27 — O assistente de criação 🔲

Em `/rules/new`, com o rascunho na search ([D-19](decisions.md#d-19--rota-própria-para-o-assistente)):

1. **tipo** — pelo `kind` da gramática canônica (comando, leitura e edição de arquivo, busca, rede,
   MCP, subagente), com o nome traduzido e os mais usados primeiro; não há ferramenta do motor a
   escolher: a regra vale, por padrão, em todo motor que tenha o `kind` (`engine` nulo), e restringi-la
   a um motor registrado é uma opção do passo. O campo seguinte muda com o `kind` (comando, caminho,
   domínio); `mcp` só oferece a ferramenta ou o servidor inteiro, com o aviso de largura (S-186). O web
   não conhece nome de ferramenta do Claude ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect));
2. **padrão** — "exatamente este comando", "este comando e o que vier depois dele" (prefixo, só para
   `shell` — [D-08](decisions.md#d-08--prefixo-em-tool-de-caminho)) ou "qualquer uso da ferramenta";
   quem **escreve** o padrão é o domínio, na gramática canônica, pela **prévia** do servidor
   (debounced), a partir de `{ kind, subject, form }`: o padrão aparece em mono, editável, e a prévia mostra na hora a frase, a
   largura, os exemplos do que casa e não casa, e o erro de gramática traduzido antes de enviar
   (S-185);
3. **decisão** — Permitir sem perguntar / Bloquear sempre, com o que cada uma significa;
4. **onde vale** — em todo lugar, ou numa pasta escolhida **pelo seletor do plano 06**; não existe
   campo de texto para a pasta, e o seletor só anda dentro das raízes do usuário (S-187). Quando a
   pasta tem subpastas com sessões ou a pasta-mãe tem regras, o passo diz que `project` é exato
   ([D-10](decisions.md#d-10--project-alcança-as-subpastas));
5. **validade** — atalhos e data livre, teto da decisão à vista, erro na linha acima dele (S-191);
6. **revisão — o segundo passo**, sempre, para `allow` e `deny` (S-188): o alcance por extenso
   (padrão, onde, até quando), os achados da análise ("idêntica à regra X" desabilita salvar e oferece
   abrir ou estender a que existe — S-190; "esta regra nunca responderia: a regra Y bloqueia tudo que
   ela cobre"), o resumo da simulação ("nas suas últimas 200 invocações, esta regra teria respondido
   12 que foram perguntadas a você") e, para `allow` `broad`, uma confirmação explícita que diz o
   quanto ela cobre; `unbounded` é bloqueado com a explicação e sugestões mais estreitas (S-189).
   Voltar não envia nada.

Criar tem a guarda de clique duplo (S-194). Erro do servidor mantém o assistente preenchido, com a
mensagem traduzida no passo certo — a pasta que saiu da allowlist volta ao passo 4 (S-195). A search
é dado não confiável: campo a campo validado, inválido descartado (S-192).

**Entradas**: o botão da tela, a paleta, o duplicar e os modelos (B-30), e **"criar regra a partir
desta invocação"** na trilha — em `AuditTrail` hoje, na tela do [plano 14](../14-audit-explained/README.md)
quando existir —, que preenche o padrão mais estreito daquela invocação (S-193); e o **Recriar** de uma
regra desligada pela migração do plano 28 (B-21), que preenche decisão, escopo e pasta e mostra o padrão
antigo só como referência (S-225).

### B-28 — Testar um comando 🔲

Um painel (na tela, pela ação do cabeçalho e pela paleta; no assistente, dentro da revisão e ao lado
do padrão): o tipo (`kind`), o campo dele, pasta pelo seletor, modo canônico (`ask`, `readOnly`,
`acceptEdits`, com o nome traduzido) e,
opcional, "nesta sessão" para uma sessão viva do usuário ([D-12](decisions.md#d-12--o-que-o-teste-de-comando-considera)).

O resultado é um veredito grande e em palavras — "seria permitido sem perguntar, pela regra X", "seria
bloqueado pela regra Y — ela vence a regra Z, que permitiria", "o `{agent}` perguntaria a você: nenhuma
regra casa", "perguntaria: no modo somente leitura, regras que permitem não respondem" —, a lista de
**todas** as regras que casam com link para cada uma, e as ressalvas do que o motor decide antes, que
vêm do backend pelo adapter (S-196, S-197). No
assistente, o teste inclui o rascunho (S-198). Pasta recusada mostra o erro traduzido (S-199).

### B-29 — Simular contra a trilha 🔲

Pela [D-15](decisions.md#d-15--quantas-invocações-a-simulação-lê-e-o-que-ela-conta):

- **"se esta regra existisse"** — no assistente, na revisão, e num painel próprio: contagens e a lista
  do que mudaria, cada item com a invocação, quando, onde, o que aconteceu e o que aconteceria (S-200);
- **"se eu revogar esta"** — no detalhe de uma regra, e sobre uma seleção: o que voltaria a ser
  perguntado (S-201);
- seletor de quantas invocações ler (50, 200, 1000), avisando que o modo da sessão não está na trilha e
  quantas não tinham pasta registrada (S-202); trilha vazia explica por que não há o que simular.

### B-30 — Modelos e duplicar 🔲

- **Modelos** — um catálogo em cartões (nome, o que faz, as regras com a decisão), da
  [D-16](decisions.md#d-16--onde-moram-os-modelos-de-regra-e-quais-entram). Escolher um abre a revisão
  de várias regras: cada uma desligável, a pasta escolhida uma vez pelo seletor (ou em todo lugar), a
  validade do lote, os achados e o segundo passo — e só então aplica, pela importação (S-203). Nada
  nasce antes de confirmar;
- **Duplicar** — do detalhe, do menu e da paleta: abre o assistente com os campos da regra e validade
  nova. Sem mudar nada, a revisão diz "idêntica à regra X" (S-204). É também o "editar o padrão" da
  [D-01](decisions.md#d-01--o-que-se-edita-numa-regra): ao salvar uma cópia alterada, o assistente
  oferece revogar a original, com desfazer.

### B-31 — Exportar e importar 🔲

- **Exportar** — da seleção ou do filtro atual, baixa `remote-claude-rules-AAAA-MM-DD.json` (S-205),
  e a ajuda diz o que o arquivo contém (padrões e pastas — não segredo, mas o mapa do que o `{agent}`
  pode fazer aqui) e que a exportação fica na trilha;
- **Importar** — escolher o arquivo abre a prévia em tabela: veredito por item (nova, já existe,
  inválida com o motivo traduzido), remapear pasta de outra máquina **pelo seletor** para os itens com
  pasta desconhecida, confirmação item a item dos `broad`, validade do lote, e o segundo passo com a
  contagem e o alcance (S-206). Importação recusada mostra os motivos por item, e nada nasceu (S-207);
  arquivo grande demais é recusado com a mensagem traduzida (S-208).

### B-32 — Usabilidade e ajuda do assistente, do teste, da simulação e da importação 🔲

- ajuda de cada passo na gaveta da moldura, com os exemplos do padrão e o "por que não posso
  permitir o shell inteiro" — a explicação da largura escrita para quem não conhece shell; os exemplos
  são da gramática canônica (`shell` inteiro, `shell(git:*)`), ajuda do núcleo;
- tooltip em todo controle de ícone; validação na linha antes de enviar; foco no primeiro campo com
  erro;
- só com o teclado se completa o assistente, do primeiro passo ao criar (S-210);
- axe sem violação em cada passo, no teste, na simulação e na prévia da importação; tudo traduzido
  (S-209).

---

## Cenários cobertos

S-185…S-210.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
```
