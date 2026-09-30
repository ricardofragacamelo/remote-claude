# Estrutura de pastas do front web

Organização **por feature**, com a cadeia
[`Component → Hook → Service`](01-architecture.md) visível dentro de cada uma.

Voltar para o [índice do web](README.md).

---

## Por que por feature, e não por tipo

```
❌ src/components/…  src/hooks/…  src/services/…      (por tipo)
✅ src/features/session/{components,hooks,services}    (por feature)
```

Por tipo, uma mudança em "sessão" toca três pastas distantes e nada indica que os arquivos
se relacionam. Por feature, a mudança fica contida — e a pasta revela a fronteira.

---

## Árvore

```
web/
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── AppFrame.tsx            a moldura: navegação global, menu Arquivo, conta
│   │   ├── FramedOutlet.tsx        o layout `_frame`: a moldura e o portão de login (SignedIn)
│   │   ├── global-navigation.ts    o registro da navegação global e do menu "gerenciar"
│   │   ├── ClaudeSideBar.tsx       o chat da aba (componentes de sessão de hoje, até o plano 08)
│   │   ├── *Route.tsx              uma por tela: /workbench, /audit, /rules, /devices, /diagnostics,
│   │   │                           /settings/$section, /about — e o "não encontrado" (NotFoundRoute)
│   │   ├── workbench-location.ts   a search do workbench (`?folder=`), lida e escrita num par só
│   │   ├── router.tsx              rotas
│   │   └── providers.tsx           QueryClient, i18n, tema, error boundary
│   │
│   ├── features/
│   │   ├── session/
│   │   │   ├── components/         SessionList.tsx, SessionTranscript.tsx
│   │   │   ├── hooks/              useSessions.ts, useSessionStream.ts
│   │   │   ├── services/           session.service.ts
│   │   │   ├── types/              modelos da feature (não DTO)
│   │   │   ├── store/              zustand, só se a feature precisar
│   │   │   └── index.ts            superfície pública da feature
│   │   │
│   │   ├── workbench/              abas de pasta, a casca (activity bar, side bar, painéis,
│   │   │                           status bar), o store por pasta e os registros de views
│   │   ├── workspace/              boas-vindas, diálogo "Abrir pasta", recentes
│   │   ├── commands/               registro de comandos e atalhos, paleta, menu Arquivo
│   │   ├── notifications/          toasts e centro de notificações
│   │   ├── diagnostics/            Logs e diagnóstico: a conexão, "reconectar" e o ping de ponta a ponta
│   │   ├── settings/               Configurações do app e o registro de seções (Aparência, e
│   │   │                           Workspaces com o conteúdo do barril de `workspace`)
│   │   ├── about/                  Sobre: versões da instalação, documentação, licença
│   │   ├── devices/                aparelhos aprovados
│   │   ├── permission/             pedido, escolha de escopo e as regras persistidas
│   │   ├── audit/                  consulta da trilha
│   │   ├── transcript/
│   │   └── auth/
│   │
│   ├── shared/
│   │   ├── api/
│   │   │   ├── api.ts              ← o cliente HTTP. Existe UM.
│   │   │   ├── ws-client.ts        ← o cliente WebSocket. Existe UM.
│   │   │   └── errors.ts           normalização → AppError
│   │   ├── components/
│   │   │   ├── ui/                 ← shadcn/ui (gerado). Não edite à mão.
│   │   │   ├── ScreenFrame.tsx     moldura de tela: título, propósito, painel de ajuda (HelpPanel)
│   │   │   ├── HelpSheet.tsx       a ajuda de uma tela sem moldura (o workbench), num sheet
│   │   │   ├── LearnMore.tsx       "saiba mais": abre a ajuda da tela na parte certa
│   │   │   ├── IconButton.tsx      controle só de ícone: `aria-label` e tooltip, exigidos pelo tipo
│   │   │   └── …                   compostos nossos: ErrorState, EmptyState
│   │   ├── hooks/                  genéricos: useMediaQuery, useRegistry, useCopy, e os stores da UI
│   │   │                           do app inteiro (useTheme, useLocale, useDensity, useHelpPanel)
│   │   ├── i18n/                   config + locales/{en,pt-BR}.json
│   │   ├── logging/                logger pino
│   │   ├── lib/                    cn(), formatadores, createRegistry, visitor-storage, notify
│   │   └── config/                 env validado com Zod
│   │
│   └── styles/
│       └── globals.css             Tailwind + tokens de tema
│
└── test/
    ├── unit/                       espelha src/
    ├── integration/
    └── support/                    handlers MSW, builders, render helper
```

### O workbench e a moldura — o que muda no `app/`

A árvore acima é a do [plano 06](../../plans/06-workbench/README.md)
([ADR-014](../shared/00-decisions.md#adr-014--o-web-vira-um-workbench-construído-em-react)); esta
seção diz o que saiu, para quem procurar o nome antigo:

- o **`Screen`** de coluna única (`app/Screen.tsx`) deu lugar à **moldura do app** (`AppFrame`) e, nas
  telas fora do workbench, à **moldura de tela** (`ScreenFrame`, em `shared/components/`, porque
  telas de várias features a usam — [web/03](03-ui-system.md#moldura-de-tela));
- a home (`App.tsx`) deixou de empilhar seletor de workspace, sessão, ping e dispositivos: é a
  boas-vindas, ou leva à aba ativa; o ping foi para `features/diagnostics` (`/diagnostics`) e os
  dispositivos para `/devices`;
- `SessionRoute`, `HistoryRoute`, `ConversationRoute` e as navegações para eles saíram com as rotas
  ([06 · D-07](../../plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas));
  `HistoryScreen`, `ConversationList` e a retomada ficam nas features, sem rota, até o plano 08;
- o store global de workspace selecionado (`features/workspace/store/workspace.store.ts`) saiu: a
  pasta é da aba ([web/04](04-state-and-data.md#estado-de-aba-de-pasta)).

Os registros da casca ([web/03](03-ui-system.md#os-registros--onde-os-planos-seguintes-encaixam))
moram na feature que os usa — views em `workbench/`, comandos em `commands/`, seções em
`settings/` —, e um plano seguinte registra a sua entrada pelo barril dessa feature, nunca por
caminho profundo.

---

## Fronteira de feature

Cada feature expõe **uma** superfície pública:

```ts
// src/features/session/index.ts
export { SessionList } from './components/SessionList'
export { useSessions } from './hooks/useSessions'
export type { Session } from './types/session'
```

Regras:

1. Feature importa outra feature **apenas pelo barril** (`@/features/workspace`), nunca por
   caminho profundo.
2. Feature **não** importa `services/` ou `hooks/` internos de outra feature. Precisou? Ou é
   `shared/`, ou as duas features são uma só.
3. Sem ciclo entre features. O lint reprova.
4. `shared/` **nunca** importa de `features/`. A seta aponta sempre para `shared/`.

---

## Quando algo vira `shared/`

Só quando é usado por **três ou mais** features **e** não tem regra de negócio.

Com duas features, duplique. Abstração criada cedo demais vira código que ninguém pode mudar
sem quebrar um consumidor desconhecido — e a duplicação teria custado menos.

`shared/components/ui/` é exceção: é o shadcn/ui gerado, e vive lá por definição.

---

## Convenções de arquivo

| Tipo | Nome | Exemplo |
|---|---|---|
| Componente | `PascalCase.tsx` | `PermissionPrompt.tsx` |
| Hook | `useCamelCase.ts` | `usePermissionQueue.ts` |
| Service | `kebab.service.ts` | `session.service.ts` |
| Store | `kebab.store.ts` | `session-stream.store.ts` |
| Tipo | `kebab.ts` | `session.ts` |
| Teste | `*.spec.ts(x)` em `test/` | **nunca** em `src/` |

**Um componente por arquivo**, com o mesmo nome do arquivo. Subcomponente usado só ali pode
ficar no mesmo arquivo, abaixo, sem export.

---

## Path aliases

```jsonc
{ "paths": {
    "@/*":           ["src/*"],
    "@/features/*":  ["src/features/*"],
    "@/shared/*":    ["src/shared/*"],
    "@contracts":    ["../packages/contracts/src"]
} }
```

Relativo (`./`, `../`) só **dentro** da mesma feature. Atravessou fronteira, usa alias.

---

## Regras verificadas por lint

| Regra | Proíbe |
|---|---|
| `no-api-in-components` | import de `@/shared/api` ou de `*/services/*` dentro de `components/` |
| `no-react-in-services` | import de `react` dentro de `services/` |
| `no-cross-feature-internals` | caminho profundo entre features |
| `shared-cannot-import-features` | `shared/` importando `features/` |
| `no-literal-jsx-text` | texto literal apresentável no JSX |
| `no-console` | `console.*` em qualquer lugar |
| `no-test-in-src` | arquivo de teste dentro de `src/` |
