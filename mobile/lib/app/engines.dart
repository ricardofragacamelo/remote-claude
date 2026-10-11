/// The composition of the engine extensions of the app (ADR-025): the one file of the app that may
/// import `engines/`, to register an extension into the registries of the core.
///
/// Nothing is registered: the app has no screen of one engine only (plan 28, D-15). The rules of
/// `analysis_options.yaml` already refuse the core importing `engines/`, so the first extension is
/// wired here and nowhere else.
library;
