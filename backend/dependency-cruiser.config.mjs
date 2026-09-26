/**
 * What a package resolves to, not what it is called.
 *
 * `dependency-cruiser` matches `to.path` against the **resolved** path of a dependency, so a rule
 * written against the bare package name silently matches nothing — a gate that is switched on and
 * inspects nothing. Under pnpm the real path ends in `node_modules/<name>/`, which is what this
 * matches, and `test/unit/architecture/dependency-rule.spec.ts` proves each rule still fires.
 */
const FRAMEWORK = 'node_modules/(@nestjs/|drizzle-orm/|@anthropic-ai/|pg/|ws/|express/)';

/**
 * The Dependency Rule, as a machine check.
 *
 * Every structural rule in the architecture documents has a verifier, or it is folklore that
 * erodes in the first busy week — docs/architecture/shared/09-code-quality.md. A violation here
 * breaks the build; it is not a warning.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
export default {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment:
        'src/domain/ is plain TypeScript. A framework import here is the first crack: an entity ' +
        'that knows Nest cannot be tested without Nest, and a rule that imports an ORM has ' +
        'stopped being a rule. See docs/architecture/backend/01-clean-architecture.md.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { dependencyTypes: ['npm'], path: FRAMEWORK },
    },
    {
      name: 'application-is-framework-free',
      comment:
        'A use case is constructed with `new` and plain interfaces. A decorator here means the ' +
        'unit test needs a container, which is exactly what this layer exists to avoid.',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { dependencyTypes: ['npm'], path: FRAMEWORK },
    },
    {
      name: 'no-outward-dependency',
      comment:
        'The dependency always points inwards: domain ← application ← adapter ← infrastructure.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '^src/(application|adapter|infrastructure|shared)/' },
    },
    {
      name: 'no-outward-dependency-application',
      comment: 'application/ declares ports; it never reaches for the adapter that implements one.',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { path: '^src/(adapter|infrastructure|shared)/' },
    },
    {
      name: 'no-cross-domain-internals',
      comment:
        'One domain reaches another through its barrel only. A deep path welds the two together ' +
        'and makes the public surface of a domain impossible to change.',
      severity: 'error',
      from: { path: '^src/(domain|application)/([^/]+)/' },
      to: {
        path: '^src/(?:domain|application)/[^/]+/',
        // Its own inside is fine, and so is anybody's barrel — that is what a barrel is for.
        pathNot: '(^src/$1/$2/)|(/index\\.ts$)',
      },
    },
    {
      name: 'sdk-is-isolated',
      comment:
        'The Agent SDK lives behind one adapter. The rule exists before the code it protects, ' +
        'on purpose: added afterwards it would be born already violated.',
      severity: 'error',
      from: { pathNot: '^src/adapter/outbound/claude/' },
      to: { dependencyTypes: ['npm'], path: 'node_modules/@anthropic-ai/' },
    },
    {
      name: 'transcript-reads-through-the-sdk',
      comment:
        'The history is read by `listSessions`, `getSessionInfo` and `getSessionMessages` of the ' +
        'Agent SDK, and never by a parser of ours: the JSONL is internal to Claude Code, shared ' +
        'with the editor and changes format without notice, so a parser of our own breaks on the ' +
        'next SDK release without a word. Nothing in the transcript slice may reach for the ' +
        'filesystem. See docs/architecture/backend/03-modules.md#transcript.',
      severity: 'error',
      from: {
        path: '^src/(domain/transcript/|application/transcript/|adapter/inbound/http/transcript/|adapter/outbound/transcript/|adapter/outbound/claude/transcript)',
      },
      to: {
        dependencyTypes: ['core'],
        path: '^(node:)?(fs|fs/promises|readline|readline/promises)$',
      },
    },
    {
      name: 'no-line-reader',
      comment:
        'Reading a file line by line is how a JSONL parser begins, and nothing in this backend ' +
        'has another reason to. The transcript is read by the SDK — see the rule above.',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['core'], path: '^(node:)?(readline|readline/promises)$' },
    },
    {
      name: 'identity-is-isolated',
      comment:
        'Everything that knows what OIDC is lives in one folder — which is what makes changing ' +
        'identity provider a change of configuration. See docs/architecture/shared/08-authentication.md. ' +
        'The push adapter is the one other place allowed to reach for `jose`, and for something ' +
        'that is not identity at all: it signs the assertion its own provider exchanges for an ' +
        'access token. The rule is about OIDC knowledge spreading, not about a crypto primitive, ' +
        'and `openid-client` and `oidc-client` stay out of there.',
      severity: 'error',
      from: { pathNot: '^src/adapter/outbound/(identity|push)/' },
      to: { dependencyTypes: ['npm'], path: 'node_modules/(jose|openid-client|oidc-client)/' },
    },
    {
      name: 'push-does-not-learn-oidc',
      comment:
        'The exception above is for one library and one reason. A push adapter that imported an ' +
        'OIDC client would be identity knowledge in a second folder, which is what the rule it ' +
        'is excepted from exists to prevent.',
      severity: 'error',
      from: { path: '^src/adapter/outbound/push/' },
      to: { dependencyTypes: ['npm'], path: 'node_modules/(openid-client|oidc-client)/' },
    },
    {
      name: 'no-test-in-src',
      comment: 'Tests mirror the source from test/; they never sit beside it.',
      severity: 'error',
      from: {},
      to: { path: '^src/.+\\.(spec|test)\\.ts$' },
    },
    {
      name: 'no-circular',
      comment: 'A cycle is a module that cannot be built, tested or reasoned about on its own.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'A module nothing imports is either dead or wired in a way nobody can see.',
      severity: 'error',
      from: { orphan: true, pathNot: '^src/main\\.ts$' },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require'] },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
