# Plano 10 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> O plano nasceu em 2026-10-02 de duas decisões que o usuário tomou no [plano 09](../09-chat-layout/decisions.md)
> (lá, D-17 e D-19), já fechadas. As outras oito nasceram ao planejar, estão **abertas**, e cada uma traz
> uma **recomendação** em **Resultado**, que só vale depois que o usuário responder.
>
> As decisões de **lugar** que o 09 fechou (D-04…D-16 de lá) valem aqui sem repetir a pergunta: a caixa
> até 40 %, enviar/parar híbrido, o motivo de não enviar, o menu "Commands" que sai, encerrar confirmado,
> o card na linha da tool, o foco que fica na caixa, as tarefas sobre a caixa, o desfazer na mensagem e
> no `⋯`, os verbos sorteados. E a [09 · D-05](../09-chat-layout/decisions.md#f1--moldura-do-painel): na
> sessão encerrada, enviar retoma.

---

## F0 — Normas

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | O que o app ganha | o app não mostra thinking, desenha as mensagens e depois as tools (fora da ordem), põe a fila de permissão acima da conversa e não tem modo, modelo, esforço, fila de prompts nem rascunho | escopo | **2026-10-02 — paridade com o painel web**, decisão do usuário (no 09, D-17; a recomendação era só o molde e o inline). Além das três faixas, da ordem real e do inline (indicador, thinking, permissão, plano), o app ganha o rascunho com modo, modelo e esforço, a fila de prompts, a lista de tarefas, o contexto da janela e as ações da mensagem (editar por fork, bifurcar, desfazer até aqui). **Fica fora:** o contexto do prompt (`@`, anexo, seleção do editor), os diffs e a view "Alterações", as abas de conversa, o subagent aninhado, exportar e a busca na conversa | ✅ |
| D-02 | A tela que a notificação abre continua? | com o card inline na conversa, a `PermissionPage` avulsa (plano 02) poderia sumir | B-22 | **2026-10-02 — continua**, decisão do usuário com a recomendação (no 09, D-19). A notificação abre o pedido, revalidado no servidor, como hoje. "Abrir sessão" leva à conversa com o card à vista | ✅ |
| D-03 | Quando este plano começa | as normas do app espelham as do web (a F0 do 09), mas o código do app não depende do código do web | F0 | **Recomendação: depois que o 09 fechar inteiro.** O app espelha o que o web **provou**, não o que o web planejou: uma decisão de lugar que a F5 do 09 corrigir chega aqui uma vez só. E as duas pontas não disputam o mesmo e2e nem a mesma máquina (R-07). A alternativa é começar depois da F0 do 09, em paralelo com o resto dele | 🔲 |
| D-04 | Como provar que os textos compartilhados são iguais no web e no app | o `i18n:check` compara chaves dentro de cada família, nunca entre elas; e as chaves têm convenções diferentes (`sessions.working.verbs.*` no web, camelCase nos ARB) | B-03 | **Recomendação: um mapa declarado**, chave do web → chave do app, para os textos que as duas pontas mostram (os verbos, a pílula, o thinking, a faixa de encerrada). O `i18n:check` lê o mapa e compara texto a texto, por idioma. Gerar as chaves do app a partir das do web seria mais forte, mas mexeria no fluxo de ARB de todo o app por causa de vinte textos | 🔲 |

## F1 — Moldura da sessão

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | O rascunho no app | hoje tocar na pasta abre a sessão na hora. O esforço só se escolhe antes da sessão (08 · D-16), então paridade com o esforço pede um momento antes do `session.start` | B-08, B-11 | **Recomendação: o rascunho, como no web** (08 · D-07): tocar na pasta abre a tela sem sessão, e a sessão nasce no primeiro prompt com o modelo, o modo e o esforço escolhidos. Nenhum subprocesso (~222 MB, conta no teto) existe só porque alguém abriu uma pasta para olhar. A alternativa é manter o início no toque e o esforço sempre no padrão | 🔲 |

## F2 — Composer

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | O que cabe na barra em 360 dp | a barra tem seis controles, cada um com alvo de 48 dp; em 360 dp, com margem, cabem cerca de seis, e não sobra lugar para o texto do chip | B-10 | **Recomendação: a regra do 09 · D-04, com a largura medida.** `/`, modo e enviar/parar nunca saem da barra. Modelo, esforço e contexto vão para um menu de excesso (`⋯` da barra) abaixo da largura em que os seis não cabem, a medir na B-10 em 360 dp e com fonte em 200 % | 🔲 |
| D-07 | Digitar `/` abre os comandos? | o app tem uma folha de comandos com busca; o web tem uma completion inline enquanto se digita | B-12 | **Recomendação: sim, a mesma folha.** Digitar `/` no início da caixa abre a folha, já filtrando pelo que vem depois, e o botão `/` da barra também. Uma completion inline, como a do web, disputaria o pouco espaço acima do teclado com a fila e a pílula | 🔲 |

## F3 — Cabeçalho

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-08 | Onde ficam o id e o custo da sessão | o web põe no tooltip do status e na status bar (09 · D-11); o app não tem tooltip de hover nem status bar | B-15 | **Recomendação: na folha que o toque no status abre**, com o estado por extenso, o id (com copiar) e o custo desde que abriu. O resumo de cada turno continua na conversa. A alternativa é um item do menu `⋯`, que esconde o custo um nível mais fundo | 🔲 |

## F4 — Inline

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-09 | O gesto das ações da mensagem | o web mostra editar, bifurcar e desfazer ao passar o mouse; o celular não tem hover | B-24 | **Recomendação: pressionar e segurar**, que abre uma folha com as três ações, e as mesmas três como `Semantics` custom actions para o TalkBack (R-08). Um ícone `⋯` em cada prompt deixaria a conversa cheia de alvos de 48 dp | 🔲 |
| D-10 | O push de um pedido da sessão que está na tela | o que o app faz hoje com um push em primeiro plano — **a conferir** no `platform_push_gateway` e no handler de mensagem com o app aberto | B-22 | **Recomendação:** com a tela daquela sessão aberta, o pedido dela não gera notificação local: o card inline, a pílula e o `liveRegion` bastam. Pedido de **outra** sessão continua notificando, e o toque abre a `PermissionPage` dele ([D-02](#f0--normas)) | 🔲 |

## F5 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: a fase prova o que F0…F4 decidiram | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 10-mobile-chat-layout`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
