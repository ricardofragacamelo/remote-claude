# F1 — Diagnóstico

Plano: [05 — Endurecimento e operação](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-limits.md).
**Entrega:** dá para ligar `debug` em release sem recompilar nada — e desligá-lo sem ter de
lembrar.

---

## O que esta fase deixou de ser

Ela nasceu como "Logs do cliente": o endpoint que recebia as linhas do web e do app (B-08) e os
dois shippers que as mandavam (B-09, B-10). **Saiu em 2026-09-27, por decisão do usuário** — o log
do cliente fica no cliente, e o que liga um erro na tela ao log do backend é o `traceId`. O
`LogBuffer` que o bootstrap tinha deixado sem endpoint saiu junto. O que sobrou é o que não manda
nada a lugar nenhum: a tela que liga `debug` ([progresso](progress.md#escopo-reduzido-ou-adiado)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-11 — Tela de diagnóstico ✅

Liga `debug` em release e mostra o estado da conexão e da credencial. A função
`levelFor(isRelease, debugRequested)` já existe e está coberta desde o bootstrap; o que falta é
a tela que a aciona.

Sair da tela volta o nível ao normal — nível de log elevado esquecido é vazamento lento.

**Como ficou:** feature `diagnostics`, rota `/diagnostics`, aberta pelo ícone na tela inicial.
Mostra a conexão, se há login e a versão; o interruptor de `debug`
é um provider que vive com a tela — ao ser descartado, devolve o logger ao nível do build.
`levelFor` foi para `core/logging/log_level.dart`, porque agora uma feature também precisa dele.

---

## Cenários cobertos

S-21.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
