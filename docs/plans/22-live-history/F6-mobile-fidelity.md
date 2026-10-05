# F6 — Fidelidade no mobile

Plano: [22 — Histórico ao vivo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-mapping.md). Pode correr antes, depois ou junto da [F5](F5-web-fidelity.md).
**Antes de começar:** conferir o estado do [plano 10](../10-mobile-chat-layout/progress.md), que mexe nos mesmos
widgets (R-09).
**Entrega:** o app mostra a conversa com as mesmas regras do web: pensamento, ferramenta num card recolhível com
título, IN/OUT e saída completa sob demanda, e a imagem do prompt marcada e aberta sob demanda. O app não tem
cabeçalho de autor, e continua sem ([proposta §4.6](../../propostas/historico-ao-vivo-e-fiel.md#46-o-cabeçalho-claude-a-cada-resposta)).

**Decisões que precisam estar fechadas para começar:** as da F5 que valem para o app — D-09, D-14, D-15
([decisions.md](decisions.md#f6--fidelidade-no-mobile)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-31 — Pensamento 🔲

[thinking_line.dart](../../../mobile/lib/features/session/presentation/widgets/thinking_line.dart) segue a regra
do web: omitido é "Pensou", recolhido, com "o modelo não mostrou" ao abrir; resumido à vista, atenuado;
`redacted` com o aviso. A `Conversation` mede a duração do histórico pelo `at`, com "até N s"
([D-14](decisions.md#f5--fidelidade-no-web)). As chaves são as do par do `i18n-shared.json` (B-04).

### B-32 — O card de ferramenta 🔲

[tool_card.dart](../../../mobile/lib/features/session/presentation/widgets/tool_card.dart): recolhido por
padrão, como o web; rótulo pelo `title`; IN do Bash com o `command` em mono (não mais `Map.toString()`), OUT com
a saída; expandir pede a saída completa pela rota da B-11, uma vez; falha mostra o `summary` e "tentar de
novo"; `truncated` diz quanto tinha.

### B-33 — Imagem do prompt 🔲

[conversation_view.dart](../../../mobile/lib/features/session/presentation/widgets/conversation_view.dart): o
balão vazio dá lugar a "imagem anexada" com tipo e tamanho; tocar busca a imagem pela rota da B-12 com o token no
cabeçalho e a mostra por `Image.memory` numa tela própria; os erros têm a mensagem traduzida.

---

## Cenários cobertos

S-101…S-106, S-111…S-122 (os do app).

---

## Critério de conclusão

```bash
pnpm verify
```
