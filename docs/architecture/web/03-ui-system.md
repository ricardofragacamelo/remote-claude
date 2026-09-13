# Design system — shadcn/ui + Tailwind

Voltar para o [índice do web](README.md).

---

## Como o shadcn/ui funciona (e por que isso importa)

shadcn/ui **não é uma dependência**. É um gerador: o comando copia o código-fonte do
componente para dentro do projeto, em `src/shared/components/ui/`. A partir daí, o código é
nosso.

Consequências práticas:

- Não existe "atualizar a biblioteca". Atualizar é regerar e revisar o diff.
- Customizar é editar o arquivo — não é preciso brigar com a API do componente.
- **Mas:** `src/shared/components/ui/` é território gerado. Edição ali precisa de comentário
  `// CUSTOM:` explicando o que foi mudado, senão a próxima regeneração apaga em silêncio.

### Adicionando um componente

```bash
pnpm dlx shadcn@latest add dialog
```

Antes de adicionar, verifique se já existe. Duas variantes do mesmo botão é como um design
system morre.

---

## Camadas de componente

```
shared/components/ui/       primitivos gerados (Button, Dialog, Input)   — território shadcn
shared/components/          compostos genéricos (ErrorState, EmptyState) — nossos
features/*/components/      componentes de domínio (PermissionPrompt)    — nossos
```

Regra: componente de feature **compõe** primitivos; não reimplementa. Se você está escrevendo
um `<div>` com `role="dialog"`, pare — use o `Dialog`.

---

## Tailwind — regras de uso

### Utilitários no JSX, sem CSS solto

```tsx
<div className="flex items-center gap-3 rounded-lg border p-4">
```

Nada de arquivo `.css` por componente, nada de `styled-components`. O CSS global existe só
para tokens de tema e reset.

### Sempre `cn()` para classe condicional

```tsx
import { cn } from '@/shared/lib/utils'

<button className={cn('rounded px-3 py-2', isActive && 'bg-primary', className)} />
```

`cn()` resolve conflito de classe Tailwind (`p-2` + `p-4` → vence a última). Concatenar
string à mão produz bug de estilo que só aparece em certa combinação de props.

### Variantes com CVA, nunca com `if` de className

```tsx
const badge = cva('inline-flex items-center rounded-full px-2 py-1 text-xs', {
  variants: {
    tone: { neutral: 'bg-muted', danger: 'bg-destructive text-destructive-foreground' },
  },
  defaultVariants: { tone: 'neutral' },
})
```

### Token semântico, nunca cor literal

```tsx
<div className="bg-destructive text-destructive-foreground" />   ✅
<div className="bg-red-500 text-white" />                        ❌
```

Cor literal quebra o tema escuro e impede rebranding. O token diz **o papel**
(`destructive`), não a cor — e é isso que sobrevive a uma mudança de paleta.

---

## Tema

Tokens em `src/styles/globals.css`, como CSS custom properties. Claro e escuro definidos
pelos mesmos nomes:

```css
:root            { --background: …; --foreground: …; --destructive: …; }
.dark            { --background: …; --foreground: …; --destructive: …; }
```

Regras:

- **Nunca** defina uma cor apenas dentro de `.dark`. Toda variável existe nos dois temas.
- Tema escuro não é opcional: esta é uma ferramenta de desenvolvedor.
- A preferência do usuário persiste em `localStorage`, com `prefers-color-scheme` como default.

---

## Acessibilidade — não é opcional

O app tem um fluxo em que o usuário autoriza a execução de comando destrutivo. Um diálogo mal
construído aqui é risco real.

| Regra | Por quê |
|---|---|
| Todo controle interativo é `<button>` / `<a>` | `<div onClick>` não recebe foco nem teclado |
| Foco visível, sempre | `outline-none` sem substituto é proibido |
| Diálogo prende o foco e fecha no `Esc` | o primitivo do shadcn já faz — use-o |
| Ícone sem texto tem `aria-label` traduzido | leitor de tela |
| Contraste mínimo AA (4.5:1) | |
| **Ação destrutiva nunca é o botão com foco inicial** | evita aprovar `rm -rf` no Enter |
| Erro é anunciado (`role="alert"`) | |

`eslint-plugin-jsx-a11y` roda no CI e reprova.

---

## Padrões de UI deste produto

### Estados de tela — os quatro, sempre

Toda tela que carrega dado trata **loading**, **erro**, **vazio** e **conteúdo**. Faltou um,
o review reprova.

- **Loading:** skeleton com a forma do conteúdo, não spinner centralizado.
- **Erro:** `<ErrorState>` com `t(error.messageKey)` e ação de recuperação. Ver
  [erros](../shared/04-errors-and-http.md).
- **Vazio:** `<EmptyState>` que explica o que fazer, não só "sem dados".

### Permissão — a tela mais importante

Quando chega `permission.requested`:

- Mostre o **comando exato** em bloco monoespaçado, sem truncar. O usuário está autorizando
  execução na própria máquina; esconder o conteúdo é inaceitável.
- Destaque visual por `riskHint` (`destructive` → tom `destructive`).
- Mostre a contagem regressiva até `expiresAt` — silêncio nega.
- Botão de negar recebe o foco inicial quando `defaultToNo`.
- O escopo (`once` / `session` / `project` / `always`) é escolha explícita, com `once` default.
- Resolvida em outro dispositivo → o card se atualiza sozinho mostrando quem resolveu.

### Stream de mensagens

- Auto-scroll só quando o usuário já está no fim. Rolou para cima, respeite — é leitura.
- Renderize `message.delta` incrementalmente; nunca espere o turno completo.
- Bloco de código com `syntax highlight` e botão de copiar.
- Tool em execução mostra estado vivo, não congela em "aguarde".

---

## Responsividade

Mobile-first. O web roda no celular também — e o app Flutter não substitui isso.

```tsx
<div className="flex flex-col gap-4 md:flex-row md:gap-6">
```

Breakpoints padrão do Tailwind. Nenhuma tela pode ter scroll horizontal; alvo de toque mínimo
de 44×44 px.
