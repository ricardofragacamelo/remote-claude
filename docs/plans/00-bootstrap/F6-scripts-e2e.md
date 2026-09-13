# F6 — Scripts e e2e

Plano: [00 — Bootstrap](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-backend.md), [F4](F4-web.md), [F5](F5-mobile.md).
**Entrega:** um comando sobe tudo, roda os e2e e derruba tudo — sem deixar rastro.

---

## Tarefas

### B-37 — `scripts/run-e2e-local.mjs`

Irmão do `start-local.mjs`, com quatro diferenças que importam:

| | `start-local` | `run-e2e-local` |
|---|---|---|
| Portas | fixas | **aleatórias** (`findFreePort`) |
| Projeto compose | fixo | **único por execução** (`rc-e2e-<porta>`) |
| Encerramento | `stop` (preserva volumes) | **`down --volumes --remove-orphans`** |
| Código de saída | 0 | **o código dos testes** |

Fluxo:

```
0. purgeStaleProjects('rc-e2e-')   ← projetos E volumes órfãos
1. compose up -d                    ← portas aleatórias via env
2. aguarda Postgres e Keycloak      ← health, não sleep
3. backend                          ← env com as portas alocadas
4. web                              ← env com a URL do backend e do Keycloak
5. escreve .env efêmero para o Playwright
6. npx playwright test
7. cleanup: web → backend → down --volumes → remove o .env
8. process.exit(códigoDosTestes)
```

Três detalhes que parecem menores e não são:

- **Sair com o código dos testes.** Um script que sempre sai 0 torna o portão de e2e
  decorativo — o CI fica verde com teste vermelho.
- **`purgeStaleProjects` antes de subir.** Quando uma execução morre de forma abrupta, os
  containers somem mas o **volume nomeado sobrevive órfão**, invisível ao `compose ls`. Sem a
  varredura, o disco enche ao longo das semanas.
- **Portas aleatórias + projeto único.** É o que permite rodar a suíte com o `start-local` de
  pé, e duas suítes em paralelo no CI.

### B-38 — Playwright em `e2e/`

```
e2e/
├── scenarios/    cenários compartilhados com o mobile
├── specs/
├── fixtures/
└── smoke-live/   contra o Claude real — NÃO roda em PR
```

O e2e fala com o sistema **pela porta do usuário**: HTTP, WebSocket, UI. Importar o interior
de `backend/src` ou `web/src` transforma e2e em teste de integração disfarçado — e o lint
reprova.

### B-39 — Primeiro e2e vertical

```
login OIDC no Keycloak
 → abre WebSocket, handshake autenticado
 → envia session.ping
 → recebe session.pong com seq
 → tela renderiza o resultado, traduzido
```

Mais os cenários de resiliência que só o e2e alcança: derrubar o socket no meio e reconectar
com `resumeFromSeq` (S-27), e ficar fora além do buffer para provocar `gap: true` (S-28).

### B-40 — `integration_test` do Flutter

Mesmo cenário, no app real contra o backend real. Os **cenários** vivem em `e2e/scenarios/` e
são compartilhados: as duas pontas precisam provar o mesmo comportamento, ou a divergência
aparece só em produção.

Fica em `mobile/integration_test/` por restrição de toolchain — exige emulador e Dart.

---

## Cenários cobertos

S-27, S-28 (replay e gap), S-53…S-60 (stack e scripts), S-61, S-62 (e2e vertical nas duas
pontas).

---

## Critério de conclusão

```bash
pnpm test:e2e ; echo "exit=$?"     # exit reflete os testes
docker ps -a                        # nada do projeto
docker volume ls                    # nenhum volume rc-e2e-*
ls e2e/.env                         # não existe
```

E: com um teste propositalmente quebrado, `echo $?` é **diferente de 0**.
