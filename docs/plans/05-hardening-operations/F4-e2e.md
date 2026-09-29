# F4 — E2E

Plano: [05 — Endurecimento e operação](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-gates.md).
**Entrega:** os limites e a expiração de credencial provados pela porta do usuário — porque é
lá que eles aparecem como "o app travou".

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-21 — Cenários compartilhados dos limites ✅

Em `e2e/scenarios/`. O comportamento sob limite precisa ser o mesmo nas duas pontas: a
diferença entre "o app travou" e "atingi o limite" é a mensagem.

Os sete `limits-*.json` são lidos pelas duas pontas — `e2e/specs/limits.spec.ts` no navegador e
`mobile/integration_test/limits_test.dart` no app — e rodam na **stack de limites**
([D-13](decisions.md)): um segundo backend e um segundo web da mesma execução, sobre o mesmo
Postgres e o mesmo Keycloak, com teto de 2 sessões, 20 s de ociosidade, 20 frames/s e um minuto
para responder permissão (`LIMITS_STACK` em `scripts/lib/stack.mjs`). A execução `--live` não a
sobe.

### B-22 — Limite, TTL e rate limit na tela ✅

Abrir sessões até o teto; deixar uma sessão ociosa expirar; martelar o servidor. Em todos, a UI
mostra **o que aconteceu**, traduzido, e respeita o `Retry-After` em vez de tentar de novo na
hora.

O que os cenários acharam, e o produto passou a fazer:

- **o teto travava as duas telas.** O iniciador do web ficava em "Starting…" para sempre, e no app
  o toque na pasta não fazia nada: nenhum dos dois reconhecia a recusa do próprio `session.start`.
  Agora os dois guardam o id do comando, mostram a recusa traduzida ao lado do botão, liberam a
  próxima tentativa e não tentam sozinhos ([D-14](decisions.md)) — S-41, S-78, S-80;
- **o `4429` virou um estado da conexão, `throttled`**, com o motivo na tela, nas duas pontas, em
  vez de um "Reconectando…" que não diz que o problema foi o ritmo — S-43, S-81. No app, a frase
  estourava o cabeçalho da tela da sessão, que tem a altura de uma linha: o texto ficou curto e a
  linha do cabeçalho termina em reticências em vez de estourar;
- **a sessão aberta pela tela inicial chegava como de outro navegador** (web): a posse era aprendida
  pela tela da sessão, que ainda não existia quando o `session.started` chegou — "só o navegador
  que abriu pode encerrar", e marcada como parcial. A posse passou a um store da feature, gravado
  por quem manda o comando (iniciador, retomada, a própria tela) — S-84.

### B-23 — Credencial expirando com o socket aberto ✅

O token expira no meio de um turno: o socket não cai, a sessão continua, e o usuário não vê
nada. Esse "não ver nada" é o resultado esperado — e é o mais fácil de quebrar sem perceber.

O token de teste vive 12 s: o client do provedor local é encurtado pela administração do Keycloak
só durante o cenário, e restaurado ao fim. O turno fica aberto numa permissão sem resposta, o token
com que o socket abriu passa do `exp`, e a prova é que o mesmo socket levou o
`connection.reauthenticate` e o servidor o aceitou — nenhum socket novo, nada na tela (S-44). O
lado oposto também: com as sessões do usuário encerradas no provedor, a renovação é recusada e a
tela volta a pedir login em vez de segurar uma pergunta que ninguém pode responder (S-79).

No app, o mesmo cenário achou o pior dos defeitos desta fase: com a renovação recusada, o estado
virava um erro **com a sessão morta dentro**, e o roteador — que pergunta se há um valor — deixava a
pessoa na tela, sem credencial (S-86). E achou que o logout administrativo não basta para cortar o
app: ele pede `offline_access`, e o refresh token offline sobrevive às sessões — o cenário revoga
também as concessões de cada client.

Achado ao contar sockets: na carga de cada tela, a primeira requisição dos filhos saía **sem**
token — os efeitos de um filho rodam antes dos do pai, e o `Providers` instalava o token num efeito
comum —, voltava `401` e gastava uma renovação. O token passou a um layout effect (S-85).

---

## Cenários cobertos

S-41…S-45, S-78…S-85.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:live
```
