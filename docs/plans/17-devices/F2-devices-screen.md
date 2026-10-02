# F2 — Tela de dispositivos

Plano: [17 — Dispositivos](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-devices-backend.md) e do [plano 06](../06-workbench/README.md) entregue
(navegação global, Configurações, screen frame, palette, registro de atalhos, centro de
notificações). Decisões [D-11 e D-12](decisions.md#f2--tela-de-dispositivos) fechadas.
**Entrega:** uma tela de gestão completa em `web/src/features/devices/`, com ajuda escrita para
quem nunca viu o produto — e o aviso de aparelho pendente fora dela.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

Toda task desta fase segue a cadeia `Component → Hook → Service → api.ts`
([web/01](../../architecture/web/01-architecture.md)), zero literal apresentável, os quatro
estados de tela e tokens semânticos ([web/03](../../architecture/web/03-ui-system.md)).

### B-16 — Rota e lugar da tela 🔲

Conforme [D-01](decisions.md#d-01--onde-a-tela-mora): rota própria `/settings/devices`, dentro da
tela de Configurações do plano 06 — a seção "Dispositivos" de lá passa a ser um resumo (quantos
aprovados, quantos esperando, o próximo pendente a expirar) com o link para cá. O `DeviceList` que
o 06 moveu para Configurações sai.

O estado da tela vive na search da URL — `status`, `q`, `sort`, `device` (o painel aberto) —, para
o link reproduzir a tela e o botão voltar funcionar. Parâmetro inválido cai no padrão, sem erro;
`device` que não existe mais abre o painel em estado "não encontrado", com a volta.

Entradas: navegação global, palette ("Dispositivos: abrir"), badge de pendente (B-22).

### B-17 — Lista densa 🔲

Tabela a partir de `md`, cartões abaixo — sem scroll horizontal
([web/03 § Responsividade](../../architecture/web/03-ui-system.md#responsividade)). Colunas:

- **aparelho** — nome de exibição, e embaixo modelo · SO; ícone da plataforma;
- **estado** — chip (`Aguardando aprovação` com a contagem regressiva, `Aprovado`, `Revogado`,
  `Inativo há N dias`);
- **último acesso** — relativo ("há 3 min"), absoluto no tooltip, e o ponto "conectado agora";
- **notificação** — chip do diagnóstico de B-18 (pronta, sem token, desligada no celular, token
  recusado, falhou, servidor sem push);
- **app** — versão; **idioma** do push; **aprovado em**.

Filtros em chips: `Ativos` (padrão — pendentes e aprovados), `Aguardando`, `Aprovados`,
`Inativos`, `Revogados`, `Todos` ([D-10](decisions.md#d-10--revogados-na-lista)); busca por nome,
rótulo e modelo; ordenação por último acesso, nome, registro. **Pendentes fixos no topo** na
ordenação padrão. Filtro sem resultado mostra "nenhum aparelho com esses filtros" com **limpar
filtros**, nunca a lista vazia genérica. Skeleton que mantém a altura das linhas.

A lista é filtrada no cliente: um usuário tem poucos aparelhos, e a busca responde enquanto se
digita. Se isso mudar, o filtro vira parâmetro do `GET /devices` sem mudar a URL da tela.

### B-18 — Painel de detalhe 🔲

Painel lateral (gaveta em tela pequena) com o aparelho inteiro:

- **identidade** — nome de exibição com renomear inline, nome informado pelo app, modelo, SO,
  versão do app, idioma, código de verificação, registrado em, aprovado em, revogado em;
- **o que este aparelho pode fazer** — por estado, em frases: pendente *observa sessões e não
  decide nada*; aprovado *responde pedidos de permissão e pode criar regra respondendo "não
  perguntar de novo"*; revogado *nada — as conexões foram fechadas e novas são recusadas*;
- **notificação** — diagnóstico com a causa e **o passo seguinte** para cada caso (abrir o app
  para renovar o token; ligar a notificação nas configurações do Android; pedir a quem opera a
  credencial de push; tentar de novo), a última entrega e o botão de teste (B-21);
- **histórico** (B-13) — fatos e respostas dadas por ele; cada resposta leva à invocação na trilha
  do [plano 14](../14-audit-explained/README.md) quando existir, e a `/audit?sessionId=…` até lá;
  entradas antigas marcadas "aparelho não registrado nesta versão".

### B-19 — Aprovar com segundo passo 🔲

Diálogo que diz, antes do clique que vale ([D-04](decisions.md#d-04--código-de-verificação),
[D-12](decisions.md#d-12--reautenticar-para-aprovar)):

- o **código de verificação**, grande, com a instrução "confira que é o mesmo que aparece no
  celular" — e que o código serve para reconhecer, não é senha;
- o que o aparelho **poderá fazer** ao ser aprovado, e que a aprovação vale até ser revogada;
- nome, modelo, SO, registrado há quanto tempo e quando expiraria.

O foco inicial vai para o título do diálogo, não para o botão que aprova: um Enter distraído não
aprova. Duplo clique faz uma chamada só. Pendente que expirou com o diálogo aberto volta
`404 NOT_FOUND` e vira mensagem traduzida ("este pedido expirou — abra o app de novo no celular"),
com a lista atualizada.

### B-20 — Revogar, recusar, e em lote 🔲

- **Revogar** (aprovado) e **recusar** (pendente) no detalhe, na linha e no menu de contexto.
- **Seleção múltipla** — caixa por linha, Shift para faixa, Ctrl/Cmd+A na tabela —, e a barra de
  ações com "Revogar selecionados".
- A confirmação é o único diálogo destrutivo da tela, e diz tudo: os aparelhos **por nome**, que
  as conexões abertas fecham na hora, que eles param de decidir, que **não** encerra o login no
  provedor ([02 · D-18](../02-mobile-approval/decisions.md#d-18--o-que-a-revogação-consegue-prometer)),
  que é irreversível e que reinstalar o app volta como aparelho novo, pendente. Foco inicial na
  saída; o botão destrutivo não é o padrão
  ([web/03 § Acessibilidade](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional)).
- O resultado do lote é **por item**: quantos revogados, quais não, e por quê — sem esconder os que
  passaram atrás de um erro.

Não existe desfazer aqui, e a tela não finge que existe: revogado é terminal.

### B-21 — Push de teste e renomear 🔲

- **Enviar notificação de teste** no detalhe e no menu da linha. O resultado diz o que fazer:
  entregue → "confira o celular; se não apareceu, veja as configurações de notificação do Android";
  `409` por motivo, `502`, `503`, cada um com a causa e o passo. Depois do envio, o botão mostra
  quanto falta para poder de novo; um `429` usa o `Retry-After`.
- **Renomear** inline: Enter salva, Esc cancela, validação antes de enviar (1 a 60 caracteres).
  Salvo, um toast com **desfazer** — renomear é reversível, então desfaz em vez de confirmar.
  "Usar o nome do aparelho" limpa o rótulo.

### B-22 — Atualização viva e aviso de pendente 🔲

Conforme [D-11](decisions.md#d-11--atualização-viva): a lista se atualiza sozinha com a tela
visível e ao voltar o foco para a aba; para com a aba escondida. Linha nova não reordena nada sob
o cursor — entra com um aviso "1 aparelho novo", como o hook de hoje já evita reordenar enquanto se
clica. Resposta do polling chegando durante uma ação não desfaz o estado da ação.

Fora da tela: **badge** de pendentes na entrada de Configurações da navegação global e na
barra de status, e uma entrada no centro de notificações do 06 ("Pixel 8 está esperando
aprovação — expira em 6 dias") que leva ao diálogo de aprovar. Some quando não há mais pendente.

### B-23 — Usabilidade e ajuda 🔲

A task explícita de usabilidade e ajuda da tela, com cenários próprios:

- **gaveta de ajuda** do screen frame, escrita para quem nunca viu o produto: o que é um
  aparelho e por que ele precisa ser aprovado (*o login prova quem é; a aprovação prova de onde*);
  por que se aprova **só pelo navegador**; o que o código de verificação é e não é; o que aprovar
  deixa fazer; o que revogar faz — e o que não faz; por que o pendente some em 7 dias; aparelho
  inativo; **por que a notificação pode não chegar** (sem token, notificação desligada no Android,
  token recusado, economia de bateria, servidor sem push, celular sem rede); o que é registrado
  (registro, aprovação, renomear, teste, revogação, respostas) e o que **não** é (conteúdo do push,
  saída de comando, localização, IP);
- **tooltip** em todo controle de ícone, com nome acessível;
- **estado vazio que ensina**: sem aparelho nenhum → os passos (instalar o app, entrar com a mesma
  conta, conferir o código aqui); sem pendente → o que fazer quando um aparecer;
- **erros** que dizem o que fazer, com "saiba mais" para a seção certa da ajuda;
- **atalhos** no registro do 06 (editáveis no editor de atalhos): `/` foca a busca, `F2` renomeia,
  `Delete` abre revogar dos selecionados, `Enter` abre o detalhe; comandos na palette —
  abrir, aprovar o próximo pendente (abre o diálogo, nunca aprova direto), testar notificação do
  selecionado, revogar selecionados;
- menu de contexto na linha com as mesmas ações;
- fluxo inteiro só com teclado; axe sem violação na tela, no painel e nos três diálogos; en e
  pt-BR completos (`pnpm i18n:check`).

---

## Cenários cobertos

S-77…S-110.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
pnpm test:integration
```
