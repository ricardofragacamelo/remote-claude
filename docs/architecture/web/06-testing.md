# Testes do web

Leia primeiro a [estratégia geral](../shared/06-testing-strategy.md) — regras comuns, as seis
dimensões de cenário e a regra de cobertura estão lá. Aqui está só o específico do front.

Voltar para o [índice do web](README.md).

---

## Onde mora

```
web/
├── src/                        nenhum arquivo de teste aqui. Nunca.
└── test/
    ├── unit/                   espelha src/
    │   ├── features/session/hooks/useSessions.spec.ts
    │   └── features/session/services/session.service.spec.ts
    ├── integration/
    │   └── features/permission/PermissionPrompt.spec.tsx
    └── support/
        ├── msw/                handlers da API e do WS
        ├── builders/           aSession(), aPermissionRequest()
        └── render.tsx          render com todos os providers
```

Stack: **Vitest** + **Testing Library** + **MSW** + **Playwright** (e2e, em `e2e/`).

Vitest é o mesmo runner do backend — uma ferramenta a menos para o time aprender, e a mesma
config de cobertura.

---

## O que testar em cada elo da cadeia

A [cadeia](01-architecture.md) define o que é fácil testar em cada nível:

| Elo | Nível | Como | O que verificar |
|---|---|---|---|
| Service | unit | sem React, com `fetch` mockado | monta a requisição certa, mapeia DTO→modelo, propaga erro |
| Hook | unit | `renderHook` + service fakeado | quando busca, cache, estados, cleanup |
| Componente | integração | `render` + MSW + store real | os quatro estados de tela, interação, acessibilidade |
| Fluxo completo | e2e | Playwright | [cenários obrigatórios](../shared/06-testing-strategy.md#cenários-e2e-obrigatórios) |

Service ser função pura sem React é exatamente o que torna esse teste trivial. Se testar um
service exige renderizar algo, a cadeia foi quebrada.

---

## Regra central: teste como o usuário usa

```tsx
// ✅ query por papel e texto acessível
screen.getByRole('button', { name: t('permission.prompt.allowOnce') })

// ❌ acopla ao detalhe de implementação
container.querySelector('.btn-primary')
wrapper.find('PermissionPrompt').instance().state.isOpen
```

Ordem de preferência: `getByRole` → `getByLabelText` → `getByText` → `getByTestId`.
`data-testid` é último recurso, e só quando não há papel acessível — o que geralmente indica
um problema de acessibilidade, não de teste.

**Nunca teste estado interno de componente.** Teste o que aparece na tela e o que acontece ao
interagir. Teste de implementação quebra em refactor e passa com bug.

---

## MSW para a API e o WebSocket

MSW intercepta na camada de rede, então o `api.ts` roda **de verdade** — interceptor,
tratamento de erro, logging, tudo. Mockar o módulo do service, ao contrário, deixa toda a
camada de transporte sem cobertura.

```ts
// test/support/msw/handlers.ts
http.get('/sessions', () => HttpResponse.json([aSessionDto()]))
http.post('/sessions', () => HttpResponse.json(
  { error: { code: 'WORKSPACE_NOT_ALLOWED', messageKey: '…' } }, { status: 403 }))
```

Para o WS, um servidor fake que emite frames roteirizados — é o que permite testar replay,
`gap: true`, `seq` duplicado e permissão resolvida em outro dispositivo, de forma
determinística.

---

## i18n em teste

Renderize com o provider de i18n **real**, em `en`. Nunca mocke `t()` para devolver a chave:
isso esconde chave faltando, que é exatamente o bug que o teste deveria pegar.

Testes que verificam texto usam `t('chave')`, não o literal — senão traduzir quebra o teste.

---

## Cenários obrigatórios do web

Além dos [cenários e2e](../shared/06-testing-strategy.md#cenários-e2e-obrigatórios), e
enumerados pelas [seis dimensões](../shared/06-testing-strategy.md#como-enumerar-cenários):

1. Toda tela que carrega dado renderiza corretamente **loading, erro, vazio e conteúdo**.
2. Erro do backend vira mensagem traduzida, com ação de recuperação e `traceId` visível.
3. `permission.requested` mostra o **comando exato**, sem truncar.
4. Contagem regressiva de `expiresAt` chega a zero → o card sai da fila como negado.
5. Permissão resolvida em **outro dispositivo** some da fila sozinha, mostrando quem resolveu.
6. Duplo clique em aprovar envia **uma** resposta.
7. Evento com `seq <= lastSeq` é descartado — mensagem não duplica no replay.
8. `gap: true` limpa o store e recarrega o transcript.
9. `message.delta` de duas mensagens em voo não se misturam.
10. Trocar de sessão faz `detach` — sem vazar subscrição.
11. Reconexão do WS com backoff, sem laço apertado.
12. Token expira com o socket aberto → `connection.reauthenticate`, sem derrubar a UI.
13. Ação destrutiva **não** recebe o foco inicial no diálogo.
14. Navegação por teclado completa no fluxo de permissão.

Os itens 3, 13 e 14 não são detalhe de UX: é a tela em que alguém autoriza execução de
comando na própria máquina.

---

## Acessibilidade em teste

`jest-axe` (via Vitest) em toda tela principal, e a violação **quebra o build**. Complementa
o `eslint-plugin-jsx-a11y`, que é estático — ver
[qualidade](../shared/09-code-quality.md).

---

## Cobertura

**≥ 90 % em statements, branches, functions e lines, por arquivo**, medido sobre unit +
integração. Regra completa e exclusões:
[cobertura](../shared/06-testing-strategy.md#cobertura).

`branches` é a que reprova: é fácil cobrir o caminho feliz de um hook e deixar sem teste o
ramo de erro, o de lista vazia e o de reconexão.

---

## O que não testar

- Componente do shadcn em `shared/components/ui/` — é código gerado, testado upstream. Teste
  o **seu** uso dele.
- Estilo e classe do Tailwind. Teste comportamento, não `className`.
- Snapshot de árvore grande. Snapshot que ninguém lê é ruído que todo mundo aprova no
  automático. Use só para unidade pequena e estável.
