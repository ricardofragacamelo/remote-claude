# F6 — Scripts e e2e

Plano: [00 — Bootstrap](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-backend.md), [F4](F4-web.md), [F5](F5-mobile.md).
**Entrega:** um comando sobe tudo, roda os e2e e derruba tudo — sem deixar rastro.

---

## Tarefas

### B-37 — `scripts/run-e2e-local.mjs` ✅

Irmão do `start-local.mjs`, com quatro diferenças que importam:

| | `start-local` | `run-e2e-local` |
|---|---|---|
| Portas | fixas | **aleatórias** (`findFreePort`) |
| Projeto compose | fixo | **único por execução** (`remote-claude-e2e-<porta>`) |
| Encerramento | `stop` (preserva volumes) | **`down --volumes --remove-orphans`** |
| Código de saída | 0 | **o código dos testes** |

Fluxo:

```
0. purgeStaleProjects('remote-claude-e2e-')   ← projetos E volumes órfãos
1. compose up -d                    ← portas aleatórias via env
2. aguarda Postgres e Keycloak      ← health, não sleep
3. backend                          ← env com as portas alocadas
4. web                              ← build + preview, com as URLs alocadas
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

A metade compartilhada com o `start-local` — invocar o compose num projeto, ler o `ps`, esperar
os serviços e **depois** o realm — vive em `scripts/lib/local-stack.mjs`. Duas cópias de
"espera o Postgres, depois espera o Keycloak" é exatamente o par que diverge: uma recebe o
ajuste para máquina fria e a outra não.

O ambiente da stack efêmera é **hermético**: `ephemeralEnvironment()` fixa portas, credenciais,
`DATABASE_URL` e issuer, e o `.env` do desenvolvedor não é carregado. Suíte que passa por causa
de um valor que só existe numa máquina não prova nada.

O front web é **buildado e servido** (`vite build` + `vite preview`), não o dev server: o e2e
exercita o bundle que o usuário receberia. E o build roda com `NODE_ENV=production`, porque o
Vite entrega essa variável ao bundle e qualquer outro valor embarca o React de **desenvolvimento**
— que invoca todo efeito duas vezes e não é o artefato que ninguém publica.

### B-38 — Playwright em `e2e/` ✅

```
e2e/
├── playwright.config.ts
├── scenarios/    cenários compartilhados com o mobile
├── specs/
├── fixtures/
└── smoke-live/   contra o Claude real — NÃO roda em PR
```

O e2e fala com o sistema **pela porta do usuário**: HTTP, WebSocket, UI. Importar o interior
de `backend/src` ou `web/src` transforma e2e em teste de integração disfarçado — e o lint
reprova (`remote-claude/e2e-through-the-front-door`). `packages/contracts` é a exceção
deliberada: ele **é** o contrato publicado, e validar frame contra o mesmo guard gerado que as
três pontas usam é justamente o ponto.

`retries: 0`. Retry transforma teste instável em teste que passa eventualmente, que é como um
bug intermitente real chega em produção.

### B-39 — Primeiro e2e vertical ✅

```
login OIDC no Keycloak
 → abre WebSocket, handshake autenticado
 → envia session.ping
 → recebe session.pong com seq
 → tela renderiza o resultado, traduzido
```

Mais os cenários de resiliência que só o e2e alcança: derrubar o socket no meio e reconectar
com `resumeFromSeq` (S-27), e ficar fora além do buffer para provocar `gap: true` (S-28).

Estourar o ring é a **única** forma honesta de produzir um gap: o tamanho do buffer é
propriedade do servidor, anunciada no `connection.ready`, e o teste lê de lá em vez de supor.
Os frames saem em lotes de cem — um por vez é uma ida e volta por evento, e mil de uma vez é
mil consultas enfileiradas num pool de dez conexões.

### B-40 — `integration_test` do Flutter ✅

Mesmo cenário, no app real contra o backend real. Os **cenários** vivem em `e2e/scenarios/` e
são compartilhados: as duas pontas precisam provar o mesmo comportamento, ou a divergência
aparece só em produção. O JSON não é lido do disco pelo app — num device não existe repositório
para ler — e sim compilado com `--dart-define`, pelo mesmo script que subiu a stack.

Fica em `mobile/integration_test/` por restrição de toolchain — exige emulador e Dart.

Duas bordas são substituídas, e só duas: a **aba externa do sistema** (nenhum harness dirige
uma aba que pertence ao SO) e o **Keychain**. No lugar da primeira entra um *direct grant*
contra o mesmo realm, num client habilitado só para isso (`remote-claude-e2e`); no lugar da
segunda, um store em memória. Todo o resto é o código publicado: repositório, casos de uso,
controller, socket e widget.

O `adb reverse` é o que faz `localhost` dentro do emulador chegar à máquina que hospeda a
stack. Reescrever as URLs para `10.0.2.2` seria mais simples e estaria errado: o `iss` do token
tem que bater com o que o backend foi configurado para aceitar, e trocar o host muda o `iss`.

#### O e2e do mobile **não é portão**

`pnpm test:e2e` (portão 9) roda a suíte Playwright — web e API. O mobile roda por
`pnpm test:e2e:mobile`, **fora** do `pnpm verify:full` e fora do CI de pull request.

Não é conveniência: emulador mais build Gradle custa minutos e gigabytes, e a primeira execução
nesta máquina a deixou inutilizável. Verificação cara demais para caber no ciclo é verificação
que alguém desliga — e portão desligado é pior que portão declarado opcional. Está declarado.

O que **não** muda: nenhuma das duas se auto-pula. Pedida e sem o que precisa — sem navegador,
sem device —, cada uma falha alto, em vez de passar por ausência.

---

## Cenários cobertos

S-19 (nenhuma rota devolve 200 com erro), S-27, S-28 (replay e gap), S-29 (token real aceito),
S-37 (PKCE com `state`), S-53…S-60 (stack e scripts), S-61 e S-62 (e2e vertical nas duas
pontas), S-113…S-115 (os defeitos que o primeiro e2e encontrou).

---

## Critério de conclusão

```bash
pnpm test:e2e ; echo "exit=$?"     # exit reflete os testes
docker ps -a                        # nada do projeto
docker volume ls                    # nenhum volume rc-e2e-*
ls e2e/.env                         # não existe
```

E: com um teste propositalmente quebrado, `echo $?` é **diferente de 0** — provado por
`test/integration/scripts/run-e2e-local.spec.mjs`, que escreve o teste quebrado, roda o script
e apaga o arquivo.

O `pnpm test:e2e:mobile` tem critério próprio, e não entra neste: com um emulador de pé, roda e
sai 0. **Executado em 2026-09-14, saiu 0** — `All tests passed!`, com o app compilado, instalado e
percorrendo a fatia inteira contra o backend real.

#### Como rodar sem derrubar a máquina

O travamento que adiou esta execução não veio do convidado: o AVD já tem `hw.ramSize=2048`. Veio
do lado de fora — emulador e Gradle sem teto, e o `-Xmx8G -XX:MaxMetaspaceSize=4G` que o template
do Flutter deixa em `mobile/android/gradle.properties`, sozinho, promete 12 GB de JVM.

A cerca é cgroup, e `systemd-run` basta — é o mesmo mecanismo que o `--cpus`/`--memory` do Docker
usa por baixo, sem imagem para baixar:

```bash
systemd-run --user --scope --unit=rc-emulator -p CPUQuota=400% -p MemoryMax=7G \
  emulator -avd <AVD> -no-window -no-audio -no-boot-anim -no-snapshot-save \
  -gpu swiftshader_indirect -memory 2048 -cores 4
```

Duas lições da primeira tentativa, que **falhou**: `MemoryHigh` abaixo do working set anônimo do
emulador (~3,5 GB) faz o kernel recuperar página sem ter o que recuperar, e as threads de vCPU
travam — `detected a hanging thread 'QEMU2 CPU0 thread'`. E `MemoryCurrent` engana: ~3,4 GB do que
ele mostra é cache de página da imagem de disco, descartável. Use teto rígido folgado, sem
estrangulamento.
