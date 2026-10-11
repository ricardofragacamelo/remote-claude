# Engine extensions of the app

What only one coding agent has, one folder per engine (`engines/<engine>/`), as in the backend and the
web ([ADR-025](../../../docs/architecture/shared/00-decisions.md#adr-025--núcleo-neutro-de-agente-extensões-isoladas-por-motor-nas-três-pontas)).

Empty on purpose: the app has no screen of one engine only, and what it had of Claude was
interpretation, which moves to the backend (plan 28, D-15). The rules of `analysis_options.yaml` hold
already — the core never imports this folder, and one extension never imports another — and
`lib/app/engines.dart` is the one file that may.
