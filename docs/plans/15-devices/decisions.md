# Plano 15 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

As decisões fechadas do [plano 02](../02-mobile-approval/decisions.md) — `installId` (D-01), só o
navegador aprova (D-02), unicidade `(userId, installId)` (D-10), pendente expira em 7 dias (D-11),
o que a revogação promete (D-18), `installId` no handshake (D-19) — **não** se reabrem aqui. Toda
recomendação abaixo foi escrita para caber dentro delas.

---

## F0 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Onde a tela mora: seção das Configurações do plano 06, rota própria dentro delas, ou entrada própria na navegação global | o desenho final da navegação global e das Configurações do 06, escrito em paralelo | B-02, B-16 | — | 🔲 |
| D-02 | O que é "último acesso": registro do app (hoje), handshake WS, toda requisição — com que granularidade, e o que **não** se guarda | custo de escrita por handshake numa conexão que cai e volta; o que o usuário consideraria rastreamento | B-02, B-07 | — | 🔲 |
| D-03 | Renomear é do dono ou do aparelho, e quem pode pedir | se o nome que o app manda deve continuar vencendo, e se o celular pode renomear a si mesmo | B-02, B-10 | — | 🔲 |
| D-04 | Mostrar um código de verificação no app e no segundo passo da aprovação | se um código derivado do `installId` ajuda a reconhecer sem virar falsa prova; alfabeto e tamanho legíveis | B-02, B-06, B-15, B-19 | — | 🔲 |
| D-05 | O que o estado do push guarda: desfecho da última entrega, permissão do SO informada pelo app | se o app pode informar a permissão sem tela nova; custo de gravar o desfecho de cada entrega | B-03, B-08, B-15 | — | 🔲 |
| D-06 | Push de teste: é auditado? para quem? com que limite? e para app antigo? | se o app antigo mostra ou descarta um kind que não conhece (o Dart descarta; o Android nativo não foi conferido) | B-02, B-12, B-15 | — | 🔲 |
| D-07 | Revogar em lote: atômico ou por item, e com que teto | quantos aparelhos um usuário revoga de uma vez na prática — o mesmo gap da D-11 do 02 | B-02, B-11 | — | 🔲 |

### D-01 — Onde a tela mora

O roteiro põe os Dispositivos numa **seção** das Configurações do
[plano 06](../06-workbench/README.md) ("o `DeviceList` sai da home para cá"), e pede ao 15 "uma
tela de gestão completa". As duas coisas brigam: uma seção de configurações é uma coluna de
formulário; uma gestão completa é tabela, filtros, painel de detalhe, lote e histórico.

- **Seção inline nas Configurações** — um lugar só, mas a tela completa não cabe, e a URL não
  reproduz o aparelho aberto.
- **Entrada própria na navegação global** — cabe tudo, mas mistura um assunto de conta com as
  telas de trabalho (Workbench, Auditoria, Regras), e o usuário acha "Dispositivos" em dois lugares.
- **Rota própria dentro das Configurações** (`/settings/devices`) — a seção do 06 vira resumo e
  link; a tela tem layout seu, deep link e estado na URL.

**Recomendação:** rota própria `/settings/devices`, aberta pela seção "Dispositivos" das
Configurações (que mostra o resumo: aprovados, pendentes, o próximo a expirar), pela palette e
pelo badge de pendente. Continua "Configurações do app", como o 06 separa, e é "uma tela para cada
coisa", como o usuário pediu. O 07 é avisado por esta linha, não editado agora.

### D-02 — Último acesso

Hoje `last_seen_at` muda só quando o app chama `POST /devices` — no login e na rotação do token. Um
aparelho usado todo dia pode aparecer "visto há 3 semanas". A tela precisa de um número que
signifique alguma coisa, sem virar rastreamento.

- **Só o registro (como hoje)** — zero custo, número enganoso.
- **Todo handshake WS** — verdadeiro; mas o app reconecta a cada volta do background, e cada
  reconexão seria uma escrita.
- **Toda requisição HTTP e WS** — o mais preciso, e o que mais escreve.

**Recomendação:** handshake WS e registro, com **janela de 5 minutos** por aparelho (`UPDATE`
condicional, uma escrita por janela, nunca para trás), mais "conectado agora" derivado do registro
de connections em memória, sem persistir. Guarda-se **só o instante**: nem IP, nem user agent, nem
local — e a ajuda diz isso. Rastrear de onde o aparelho acessou é o tipo de dado que um produto de
máquina pessoal não precisa ter para vazar.

### D-03 — Quem renomeia

O nome de hoje é o que o app declara (`name`), e cada reabertura o reescreve. Se o dono renomear
"SM-S918B" para "Celular do trabalho", o próximo login desfaz.

- **O aparelho manda** — como hoje; renomear pela tela é inútil.
- **O dono sobrescreve o `name`** — o app o reescreve na próxima abertura, a menos que ele pare de
  mandar, o que muda o contrato do app.
- **Rótulo do dono separado** — `label` do dono, `name` continua sendo o que o app informa; exibe-se
  o rótulo quando há.

**Recomendação:** rótulo do dono, separado, **só pelo navegador** (aparelho pedindo → `403
FORBIDDEN`, pela mesma razão que só o navegador aprova: a lista onde se reconhece o aparelho não
deve ser editável por ele), auditado como `device.renamed` com o anterior e o novo. Limpar o rótulo
volta ao nome informado; o nome informado continua visível no detalhe, porque é o que ajuda a
distinguir dois celulares com o mesmo apelido.

### D-04 — Código de verificação

O que se aprova hoje é um nome que o próprio aparelho escolheu. Dois celulares com o mesmo modelo,
ou um aparelho de outra pessoa logado na mesma conta, aparecem iguais. A pergunta que a tela não
consegue responder é *"este pendente é o que está na minha mão?"*.

- **Nada** — como hoje.
- **Código curto derivado do `installId`**, mostrado no estado pendente do app e no segundo passo
  do web — confere-se olhando.
- **Pareamento por QR ou código digitado** — prova de posse, mas muda o fluxo de aprovação que o
  08-authentication fixou; é ADR, não plano.

**Recomendação:** código curto derivado, 6 caracteres de um alfabeto sem ambíguos (sem `0/O`,
`1/I/L`), em dois grupos de 3, calculado pelo backend e devolvido ao app no `201` do registro — o
app não reimplementa o hash. **Não é segredo e não autentica**: quem tem a conta vê o mesmo código
nos dois lados. Serve para **reconhecer**, e a ajuda e o diálogo dizem isso com essas palavras
([R-04](README.md#riscos-e-decisões-em-aberto)). O pareamento com prova de posse fica registrado
como alternativa, para uma ADR se um dia for pedido.

### D-05 — O estado do push

A tela precisa responder "por que a notificação não chegou". Hoje sabe só se há token.

- **Só o token (hoje)** — responde um dos seis casos.
- **Desfecho da última entrega** — `delivered`, `tokenRejected`, `rejected`, `failed`, com o
  instante, gravado por aparelho a cada envio.
- **Permissão do SO informada pelo app** — o app já calcula (`PushReachBanner`: concedida, negada,
  não perguntada, indisponível) e só não conta.

**Recomendação:** as três. O desfecho é um enum e um instante por aparelho, gravado com `UPDATE` dos
dois campos — nunca título, corpo nem pedido. A permissão vem num campo **opcional** do registro,
reenviada quando muda — sem tela nova no app. Com isso o diagnóstico cobre: pronta, sem token, token
recusado, notificação desligada no celular, última entrega falhou, servidor sem push.

### D-06 — Push de teste

"Enviar notificação de teste" é o que responde "está funcionando?" sem esperar o Claude pedir algo.
Mas é também um botão que faz o celular tocar e que custa uma chamada ao provedor.

- **Auditar?** O teste não autoriza nada. Por outro lado, "por que meu celular tocou às 3h?" é uma
  pergunta que a trilha deveria responder, e o volume é baixo por construção.
- **Para quem?** Pendente ainda não recebe push de permissão (02 · B-10 manda só para aprovados);
  testar um pendente testaria um caminho que ele não usa.
- **Limite?** Sem limite, é um botão de spam.
- **App antigo?** O Dart de hoje descarta payload sem `sessionId`/`requestId`; o lado Android não foi
  conferido e pode mostrar a notificação do sistema.

**Recomendação:** auditado como `device.pushTested`, com o desfecho em `details`; só para aparelho
**aprovado com token**; **uma** tentativa aguardada (a pessoa está olhando para o celular), sem as
novas tentativas do push de permissão; limite de 1 a cada 30 s por aparelho (`429 RATE_LIMITED`,
`Retry-After`); tag própria, que nunca interfere num pedido; e recusa com `409 DEVICE_NOT_REACHABLE`
(`appTooOld`) para versão do app anterior à que reconhece o kind — a versão mínima fixada em B-15.

### D-07 — Revogar em lote

- **Atômico** — ou todos ou nenhum. Uma revogação que falha na trilha desfaria as outras — e
  "desfazer uma revogação" é exatamente o que a F1 existe para impedir.
- **Por item** — cada aparelho é uma revogação completa (linha, sockets, trilha); o resultado diz
  item a item.

**Recomendação:** por item, sobre o `RevokeDeviceUseCase` que existe, com resultado `revoked` \|
`unchanged` \| `notFound` \| `failed` por id, ids repetidos contados uma vez, teto de **50** por
pedido. `notFound` para id de outra pessoa, sem distinguir de inexistente (02 · B-03). Revogar é
terminal: um lote que revogou três e falhou no quarto **deve** deixar os três revogados.

---

## F1 — Backend de dispositivos

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-08 | Histórico do aparelho: como saber qual aparelho respondeu, e como ler — duas listas ou a linha do tempo única do plano 12 | se o plano 12 entrega endpoint de linha do tempo com filtro por aparelho antes desta fase; custo da coluna nova em `audit_entries` | B-13 | — | 🔲 |
| D-09 | Aparelho aprovado e inativo: expira sozinho, é só sinalizado, ou nada | por quanto tempo um celular de uso raro fica parado e ainda precisa funcionar (férias, aparelho reserva) | B-14 | — | 🔲 |
| D-10 | Revogados: ficam na lista para sempre, somem depois de um prazo, ou podem ser apagados | se apagar a linha deixaria o mesmo `installId` voltar como pendente — deixaria | B-09, B-17 | — | 🔲 |

### D-08 — Histórico do aparelho

A trilha grava `resolvedFrom: 'web' | 'mobile'` na decisão — não **qual** celular. Sem isso, "o que
este aparelho aprovou" não tem resposta, e é a pergunta que se faz antes de revogar.

- **Coluna nova `resolved_by_device_id` em `audit_entries`** — `ADD COLUMN` anulável, preenchida na
  resolução, onde o `permission` já sabe o `installId` da connection. As triggers append-only não
  impedem DDL, só reescrita de linha.
- **Guardar o aparelho no `details` de um `audit_event` paralelo** — duplica a decisão em outra
  tabela, e as duas podem divergir.

E para ler: **duas listas** (fatos do aparelho, completos — são poucos; respostas, paginadas por
cursor sobre `seq`) ou **a linha do tempo única** que a D-03 do [plano 12](../12-audit-explained/README.md)
discute.

**Recomendação:** coluna nova, e `GET /devices/:id/history` com as duas listas, lida pela porta de
leitura da trilha (`AuditQueryModule`). Entradas anteriores à coluna não são atribuídas a ninguém
por palpite ([R-08](README.md#riscos-e-decisões-em-aberto)). Se o 12 entregar antes a linha do
tempo com filtro por aparelho, esta task passa a consumi-la e a registrar isso no
[progresso](progress.md).

### D-09 — Aparelho inativo

Um aparelho aprovado nunca expira hoje. Um celular esquecido numa gaveta continua podendo aprovar
comando — e continua recebendo push de permissão.

- **Revogar sozinho depois de N dias** — fecha a porta esquecida, e revoga em silêncio o celular
  reserva exatamente quando ele seria usado (as férias).
- **Só sinalizar** — "inativo há 45 dias", com filtro e sugestão de revogar.
- **Nada** — como hoje.

**Recomendação:** sinalizar depois de **30 dias** sem acesso (configurável), com filtro "Inativos"
e o motivo explicado; revogação automática como configuração **desligada por padrão**
(`RC_DEVICE_INACTIVE_REVOKE_DAYS`), que, ligada, revoga pelo mesmo use case — socket fechado,
trilha com `reason: inactive` — e recusa o boot abaixo de 7 dias. Depende da D-02: sem último
acesso verdadeiro, "inativo" seria mentira.

### D-10 — Revogados na lista

Revogados se acumulam: a linha fica, porque é ela que impede o mesmo `installId` de voltar como
pendente ao reabrir o app (o registro de um revogado é `refresh`, que nunca muda o estado).

- **Apagar a linha** — a lista fica limpa, e o celular revogado volta como pendente na próxima
  abertura, esperando alguém aprová-lo por cansaço.
- **Esconder depois de um prazo** — quarto estado ou coluna nova para um problema de filtro.
- **Ficam, e o filtro padrão os esconde.**

**Recomendação:** ficam, sem apagar e sem prazo; o filtro padrão da tela é "Ativos" (pendentes e
aprovados), com "Revogados" a um clique. O que se ganha em lista limpa se perde na única garantia
que a linha dá.

---

## F2 — Tela de dispositivos

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-11 | Como a lista e o aviso de pendente se atualizam: polling, evento WS, ou só ao abrir | se algum plano (07/08) cria um stream por **usuário** no WS — o envelope exige `seq` e hoje ele é por sessão | B-22 | — | 🔲 |
| D-12 | Aprovar exige reautenticação recente (step-up) | se o mecanismo de step-up do plano 05/11 existirá antes desta fase, e quanto atrito ele põe no primeiro aparelho | B-19 | — | 🔲 |

### D-11 — Atualização viva

O caso de uso real: a pessoa está na tela, abre o app no celular, e espera o pendente aparecer.

- **Evento WS** (`device.registered` para o usuário) — imediato, mas é evento que não é de sessão:
  exige stream próprio com `seq` próprio, e é mudança de contrato nas três pontas.
- **Polling** — 10 s com a tela visível, refetch ao voltar o foco; badge global a cada 60 s.
- **Só ao abrir** — a pessoa recarrega, e acha que o produto não viu o aparelho.

**Recomendação:** polling pelo TanStack Query (10 s com a tela visível e a aba em foco, parado com a
aba escondida; 60 s para o badge global), sem mudar o contrato WS. Reabrir se o plano 06 ou 08
criar um stream por usuário — então o evento vira uma linha nele.

### D-12 — Reautenticar para aprovar

Aprovar é autorizar de antemão alguém que segura um telefone. Um navegador esquecido aberto aprova
qualquer pendente.

- **Step-up (`max_age` do OIDC)** — prova que quem clica é quem tem a conta, agora; custa um login a
  cada aprovação e depende de um mecanismo que ainda não existe (planos
  [05](../05-hardening-operations/README.md) e [10](../10-integrated-terminal/README.md)).
- **Segundo passo com código** (D-04) — prova que quem clica está olhando para o aparelho certo; não
  prova quem clica.

**Recomendação:** não exigir step-up neste plano. O segundo passo com código resolve a falha que
acontece de verdade (aprovar o aparelho errado); o step-up resolve outra (navegador de outra
pessoa) e é do plano que o constrói. Quando existir, a aprovação vira um dos pontos que o usam — uma
linha no progresso daquele plano, não uma reabertura deste.

---

## F3 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto — o provedor de teste e o cliente WS roteirizado já existem na stack e2e | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 15`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
