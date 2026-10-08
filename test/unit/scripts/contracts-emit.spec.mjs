import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { emitDart } from '../../../scripts/lib/contracts-dart.mjs';
import { buildModel } from '../../../scripts/lib/contracts-model.mjs';
import { emitTypeScript } from '../../../scripts/lib/contracts-typescript.mjs';

const envelope = {
  source: 'envelope.schema.json',
  schema: {
    title: 'Envelope',
    type: 'object',
    required: ['v', 'kind', 'type'],
    properties: {
      v: { type: 'integer', const: 1 },
      kind: { type: 'string', enum: ['command', 'ack'] },
      type: { type: 'string' },
      seq: { type: 'integer' },
      payload: { type: 'object' },
    },
  },
};

const command = {
  source: 'commands/thing.schema.json',
  schema: {
    title: 'Thing',
    description: 'Does the thing.',
    'x-kind': 'command',
    'x-type': 'thing.do',
    type: 'object',
    required: ['token', 'client'],
    properties: {
      token: { type: 'string' },
      locale: { type: 'string', enum: ['en', 'pt-BR'] },
      client: {
        type: 'object',
        required: ['kind'],
        properties: { kind: { type: 'string' }, version: { type: 'string' } },
      },
      tags: { type: 'array', items: { type: 'string' } },
    },
  },
};

const model = buildModel(envelope, [command]);
const typescript = emitTypeScript(model);
const dart = emitDart(model);

describe('emitTypeScript', () => {
  it('says it is generated, and how to regenerate it', () => {
    expect(typescript).toContain('Do not edit');
    expect(typescript).toContain('pnpm contracts:generate');
  });

  it('maps a const to a literal type and an enum to a union', () => {
    expect(typescript).toContain('readonly v: 1;');
    expect(typescript).toContain("readonly locale?: 'en' | 'pt-BR';");
  });

  it('marks an optional field optional and a required one not', () => {
    expect(typescript).toContain('readonly token: string;');
    expect(typescript).toContain('readonly seq?: number;');
  });

  it('maps an object with no properties to an open record, keeping unknown payloads readable', () => {
    expect(typescript).toContain('readonly payload?: Readonly<Record<string, unknown>>;');
  });

  it('maps an array to a readonly array of the item type', () => {
    expect(typescript).toContain('readonly tags?: readonly string[];');
  });

  it('gives the frame the literal kind and type, so a switch narrows on them', () => {
    expect(typescript).toContain("readonly kind: 'command';");
    expect(typescript).toContain("readonly type: 'thing.do';");
  });

  it('checks the const in the guard — the version is a real compatibility check', () => {
    expect(typescript).toContain("record['v'] === 1,");
  });

  it('does not check enum membership in the guard, so a future value is not rejected', () => {
    // A closed check here would make every added locale or kind a breaking change for clients
    // already published — see docs/architecture/shared/05-websocket-protocol.md.
    expect(typescript).not.toContain("'pt-BR' ||");
    // `kind` is a required enum: the guard checks that it is a string, never which string.
    expect(typescript).toContain("typeof record['kind'] === 'string'");
    expect(typescript).not.toContain("record['kind'] === 'command'");
  });

  it('does not check optional fields in the guard', () => {
    const guard = /export function isThingPayload\(.*?\n}/s.exec(typescript)?.[0] ?? '';

    expect(guard).toContain("record['token']");
    expect(guard).not.toContain("record['tags']");
  });

  it('lists every frame type it generated', () => {
    expect(typescript).toContain("'thing.do',");
  });
});

describe('emitDart', () => {
  it('says it is generated, and how to regenerate it', () => {
    expect(dart).toContain('Do not edit');
    expect(dart).toContain('pnpm contracts:generate');
  });

  it('declares an immutable class with a const constructor', () => {
    expect(dart).toContain('class ThingPayload {');
    expect(dart).toContain('const ThingPayload({');
  });

  it('makes a required field required and an optional one nullable', () => {
    expect(dart).toContain('required this.token,');
    expect(dart).toContain('final String? locale;');
  });

  it('keeps an enum as a String, so a value added after release does not throw', () => {
    expect(dart).toContain('final String? locale;');
    expect(dart).not.toContain('enum ');
  });

  it('reads a nested object through its own fromJson', () => {
    expect(dart).toContain("ThingPayloadClient.fromJson(json['client']! as Map<String, Object?>)");
  });

  it('reads a list without dynamic anywhere', () => {
    expect(dart).toContain("(json['tags']! as List<Object?>)");
    expect(dart).not.toContain('dynamic');
  });

  it('leaves an absent optional field out of toJson instead of writing null', () => {
    expect(dart).toContain('if (locale != null) {');
  });

  it('exposes the kind and type of every frame as constants', () => {
    expect(dart).toContain("const String thingKind = 'command';");
    expect(dart).toContain("const String thingType = 'thing.do';");
  });
});

describe('both emitters', () => {
  it('are pure — the same model twice produces byte-identical output', () => {
    const again = buildModel(envelope, [command]);

    expect(emitTypeScript(again)).toBe(typescript);
    expect(emitDart(again)).toBe(dart);
  });

  it('cover the same set of frame types', () => {
    for (const message of model.messages) {
      expect(typescript).toContain(`'${message.frameType}'`);
      expect(dart).toContain(`'${message.frameType}'`);
    }
  });

  it('end with exactly one newline', () => {
    expect(typescript.endsWith('\n')).toBe(true);
    expect(typescript.endsWith('\n\n')).toBe(false);
    expect(dart.endsWith('\n')).toBe(true);
    expect(dart.endsWith('\n\n')).toBe(false);
  });
});

/**
 * A second command, written to reach the shapes the first one does not: an **optional** nested
 * object, an optional array of objects, a free-form record, and a numeric `const`.
 *
 * They are all shapes the real contract already uses or will use — an optional `details[]` on
 * the error frame, a numeric protocol version — and each one emits differently in both
 * languages. A shape nobody generated is a shape nobody knows generates correctly.
 */
const optionals = {
  source: 'events/optional.schema.json',
  schema: {
    title: 'Optional',
    'x-kind': 'event',
    'x-type': 'optional.happened',
    type: 'object',
    required: ['status', 'ok', 'meta', 'tags'],
    properties: {
      status: { type: 'integer', const: 413 },
      ok: { type: 'boolean' },
      meta: { type: 'object' },
      tags: { type: 'array', items: { type: 'string' } },
      client: {
        type: 'object',
        required: ['kind'],
        properties: { kind: { type: 'string' } },
      },
      details: {
        type: 'array',
        items: {
          type: 'object',
          required: ['field'],
          properties: { field: { type: 'string' } },
        },
      },
      labels: { type: 'array', items: { type: 'string' } },
      params: { type: 'object' },
    },
  },
};

const optionalModel = buildModel(envelope, [optionals]);
const optionalTypeScript = emitTypeScript(optionalModel);
const optionalDart = emitDart(optionalModel);

describe('the shapes an optional field takes', () => {
  it('reads an optional nested object only when it is there — Dart', () => {
    expect(optionalDart).toContain(
      "json['client'] == null ? null : OptionalPayloadClient.fromJson",
    );
  });

  it('reads an optional array of objects only when it is there — Dart', () => {
    expect(optionalDart).toContain("json['details'] == null ? null :");
    expect(optionalDart).toContain('.map((item) => OptionalPayloadDetailsItem.fromJson');
  });

  it('reads an optional array of scalars the same way — Dart', () => {
    expect(optionalDart).toContain("json['labels'] == null ? null :");
    expect(optionalDart).toContain('item! as String');
  });

  it('writes an optional nested object through the null-aware call — Dart', () => {
    expect(optionalDart).toContain('client?.toJson()');
    expect(optionalDart).toContain('details?.map((item) => item.toJson())');
  });

  it('gives a numeric const the numeric type, not the string one — Dart', () => {
    expect(optionalDart).toContain('final int status;');
    expect(optionalDart).toContain("json['status']! as int");
  });

  it('gives a numeric const the numeric literal type — TypeScript', () => {
    expect(optionalTypeScript).toContain('readonly status: 413;');
  });

  it('checks a numeric const by value in the guard — TypeScript', () => {
    expect(optionalTypeScript).toContain("record['status'] === 413,");
  });

  it('guards every required shape, not only the ones with a scalar type', () => {
    expect(optionalTypeScript).toContain("typeof record['ok'] === 'boolean',");
    expect(optionalTypeScript).toContain("isNonNullObject(record['meta']),");
    expect(optionalTypeScript).toContain("Array.isArray(record['tags']),");
  });

  it('types a free-form record as a map in both languages', () => {
    expect(optionalDart).toContain('Map<String, Object?>? params');
    expect(optionalTypeScript).toContain('Readonly<Record<string, unknown>>');
  });

  it('types an array of objects as a list of them in both languages', () => {
    expect(optionalDart).toContain('List<OptionalPayloadDetailsItem>? details');
    expect(optionalTypeScript).toContain(
      'readonly details?: readonly OptionalPayloadDetailsItem[];',
    );
  });
});

/**
 * The conditional requirement, in both languages.
 *
 * One `x-required-when` in the schema becomes a clause inside the TypeScript guard and a Dart
 * predicate beside the class. Both are generated so the rule cannot hold on one end and not the
 * other — which is the failure mode a hand-written validator per language always ends in.
 */
const conditionalModel = buildModel(
  {
    source: 'envelope.schema.json',
    schema: {
      title: 'Envelope',
      type: 'object',
      required: ['kind'],
      'x-required-when': [
        {
          field: 'seq',
          when: { field: 'kind', equals: 'event' },
          because: 'replay is built on it',
        },
      ],
      properties: {
        kind: { type: 'string', enum: ['command', 'event'] },
        seq: { type: 'integer' },
      },
    },
  },
  [
    {
      source: 'responses/resolve.schema.json',
      schema: {
        title: 'Resolve',
        'x-kind': 'response',
        'x-type': 'permission.resolve',
        type: 'object',
        required: ['decision', 'auto'],
        'x-required-when': [
          {
            field: 'reason',
            when: { field: 'decision', equals: 'deny' },
            because: 'the reason goes into the audit trail',
          },
          {
            field: 'resolvedBy',
            when: { field: 'auto', equals: false },
            because: 'a decision a human made has an author',
          },
        ],
        properties: {
          decision: { type: 'string', enum: ['allow', 'deny'] },
          auto: { type: 'boolean' },
          reason: { type: 'string' },
          resolvedBy: { type: 'string' },
          evidence: { type: 'object' },
          attempts: { type: 'array', items: { type: 'string' } },
          nested: { type: 'object', properties: { at: { type: 'string' } } },
          marker: { type: 'string', const: 'x' },
        },
      },
    },
  ],
);

const conditionalTypeScript = emitTypeScript(conditionalModel);
const conditionalDart = emitDart(conditionalModel);

describe('a conditional requirement, in TypeScript', () => {
  it('adds the clause to the guard of the declaration that carries it', () => {
    expect(conditionalTypeScript).toContain(
      "requiredWhen(record['kind'] === 'event', typeof record['seq'] === 'number'),",
    );
  });

  it('compares a boolean without quoting it', () => {
    expect(conditionalTypeScript).toContain(
      "requiredWhen(record['auto'] === false, typeof record['resolvedBy'] === 'string'),",
    );
  });

  it('emits every rule of a declaration, not only the first', () => {
    expect(conditionalTypeScript).toContain(
      "requiredWhen(record['decision'] === 'deny', typeof record['reason'] === 'string'),",
    );
  });

  it('explains the rule in the doc comment, so a reader does not have to infer it', () => {
    expect(conditionalTypeScript).toContain(
      '`seq` is also required when `kind` is `event` — replay is built on it.',
    );
  });

  it('leaves the field optional in the interface — conditional is not required', () => {
    expect(conditionalTypeScript).toContain('readonly seq?: number;');
  });
});

describe('a conditional requirement, in Dart', () => {
  it('emits a predicate named after the declaration', () => {
    expect(conditionalDart).toContain('bool envelopeConditionalsHold(Map<String, Object?> json) {');
  });

  it('refuses the frame when the rule does not hold', () => {
    expect(conditionalDart).toContain("if (json['kind'] == 'event' && json['seq'] is! int) {");
  });

  it('compares a boolean without quoting it', () => {
    expect(conditionalDart).toContain(
      "if (json['auto'] == false && json['resolvedBy'] is! String) {",
    );
  });

  it('answers true when every rule holds', () => {
    expect(conditionalDart).toContain('  return true;\n}');
  });

  it('emits no predicate for a declaration with no rule', () => {
    expect(dart).not.toContain('ConditionalsHold');
  });
});

/**
 * The shapes a rule can be written against. They are exercised here rather than left to the two
 * the contract happens to use today: a rule added on an array or an open map next year would
 * otherwise generate a check nobody ever ran.
 */
describe('the Dart shape check of a conditional, per declared type', () => {
  /** @param {Record<string, unknown>} property @param {string} expected */
  const refusalFor = (property, expected) => {
    const emitted = emitDart(
      buildModel(
        {
          source: 'envelope.schema.json',
          schema: {
            title: 'Envelope',
            type: 'object',
            required: ['kind'],
            'x-required-when': [
              {
                field: 'subject',
                when: { field: 'kind', equals: 'event' },
                because: 'the shape under test',
              },
            ],
            properties: { kind: { type: 'string' }, subject: property },
          },
        },
        [],
      ),
    );

    expect(emitted).toContain(`json['subject'] ${expected}`);
  };

  it('refuses a string that is not one', () => {
    refusalFor({ type: 'string' }, 'is! String');
  });

  it('refuses an enum that is not a string — the enum is open at runtime', () => {
    refusalFor({ type: 'string', enum: ['a', 'b'] }, 'is! String');
  });

  it('refuses an integer that is not one', () => {
    refusalFor({ type: 'integer' }, 'is! int');
  });

  it('refuses a boolean that is not one', () => {
    refusalFor({ type: 'boolean' }, 'is! bool');
  });

  it('refuses a string const that is not a string', () => {
    refusalFor({ type: 'string', const: 'x' }, 'is! String');
  });

  it('refuses an integer const that is not an int', () => {
    refusalFor({ type: 'integer', const: 1 }, 'is! int');
  });

  it('refuses an array that is not a list', () => {
    refusalFor({ type: 'array', items: { type: 'string' } }, 'is! List<Object?>');
  });

  it('refuses an open map that is not a map', () => {
    refusalFor({ type: 'object' }, 'is! Map<String, Object?>');
  });

  it('refuses a declared object that is not a map', () => {
    refusalFor(
      { type: 'object', properties: { at: { type: 'string' } } },
      'is! Map<String, Object?>',
    );
  });
});

// A payload-only contract: a shape shared over HTTP, not a frame. Both emitters have to give it
// a type and leave it out of everything that describes the socket — a client offered
// `device.register` as a frame type would be offered something the gateway has no handler for.
const payloadOnly = {
  source: 'commands/device-register.schema.json',
  schema: {
    title: 'DeviceRegister',
    description: 'What the app says about itself.',
    'x-kind': 'http',
    'x-type': 'device.register',
    type: 'object',
    required: ['installId'],
    properties: { installId: { type: 'string' } },
  },
};

const mixedModel = buildModel(envelope, [command, payloadOnly]);
const mixedTypeScript = emitTypeScript(mixedModel);
const mixedDart = emitDart(mixedModel);

describe('a payload-only contract', () => {
  it('gets a TypeScript type and a guard', () => {
    expect(mixedTypeScript).toContain('export interface DeviceRegisterPayload {');
    expect(mixedTypeScript).toContain('export function isDeviceRegisterPayload(');
  });

  it('gets no frame type and no frame guard', () => {
    expect(mixedTypeScript).not.toContain('DeviceRegisterFrame');
    expect(mixedTypeScript).not.toContain("'device.register',");
  });

  it('gets a Dart class', () => {
    expect(mixedDart).toContain('class DeviceRegisterPayload {');
  });

  it('gets no Dart frame constants and no entry in frameTypes', () => {
    expect(mixedDart).not.toContain('deviceRegisterKind');
    expect(mixedDart).not.toContain('deviceRegisterType');
    expect(mixedDart).not.toContain("  'device.register',");
  });

  it('leaves the frames alone', () => {
    expect(mixedTypeScript).toContain("  'thing.do',");
    expect(mixedTypeScript).toContain('ThingFrame');
  });
});

/**
 * The complexity gate (plan 05, D-10) reads the generated file like any other. A guard that chained
 * its checks with `||` grew one branch per field, so the gate failed on whichever payload had the
 * most — which is why each guard is a flat list, and why this checks a guard far wider than any the
 * contract has today.
 */
describe('the TypeScript guards, however many fields they check', () => {
  const fieldCount = 40;
  const ruleCount = 12;

  /** @type {Record<string, Record<string, unknown>>} */
  const properties = { mode: { type: 'string' } };
  for (let index = 0; index < fieldCount; index += 1) {
    properties[`field${String(index)}`] =
      index % 2 === 0 ? { type: 'object' } : { type: 'boolean' };
  }
  for (let index = 0; index < ruleCount; index += 1) {
    properties[`extra${String(index)}`] = { type: 'object' };
  }

  const wide = emitTypeScript(
    buildModel(envelope, [
      {
        source: 'events/wide.schema.json',
        schema: {
          title: 'Wide',
          'x-kind': 'event',
          'x-type': 'wide.happened',
          type: 'object',
          required: Object.keys(properties).filter((name) => !name.startsWith('extra')),
          'x-required-when': Array.from({ length: ruleCount }, (_, index) => ({
            field: `extra${String(index)}`,
            when: { field: 'mode', equals: `mode${String(index)}` },
            because: 'the shape under test',
          })),
          properties,
        },
      },
    ]),
  );

  it('keeps every guard within the complexity limit', () => {
    const messages = new Linter().verify(
      wide,
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: /** @type {Linter.Parser} */ (tseslint.parser) },
          rules: { complexity: ['error', 10] },
        },
      ],
      'protocol.ts',
    );

    expect(messages).toEqual([]);
  });

  it('lists the checks instead of chaining them', () => {
    const guard = /export function isWidePayload\(.*?\n}/s.exec(wide)?.[0] ?? '';

    expect(guard).toContain("    isNonNullObject(record['field0']),");
    expect(guard).toContain("    typeof record['field39'] === 'boolean',");
    expect(guard).toContain(
      "    requiredWhen(record['mode'] === 'mode11', isNonNullObject(record['extra11'])),",
    );
    expect(guard).toContain('  ].every(Boolean);');
    expect(guard).not.toContain(' ||\n');
  });

  it('emits each helper once, beside the guards that call it', () => {
    expect(wide.match(/^function isNonNullObject\(/gm)).toHaveLength(1);
    expect(wide.match(/^function requiredWhen\(/gm)).toHaveLength(1);
  });

  it('emits no helper into a file whose guards never call it', () => {
    // The first fixture has no required open map and no conditional: an unused helper would be
    // dead code in a generated file, which the lint of every consumer then reports.
    expect(typescript).not.toContain('function isNonNullObject(');
    expect(typescript).not.toContain('function requiredWhen(');
  });

  it('answers true for a guard with nothing to check', () => {
    expect(wide).toContain('export function isEnvelope(');
    expect(
      emitTypeScript(
        buildModel(
          {
            source: 'envelope.schema.json',
            schema: { title: 'Envelope', type: 'object', properties: {} },
          },
          [],
        ),
      ),
    ).toContain('  return true;\n}');
  });
});

/**
 * A rule that fires on presence or absence, and the bounds of a field — what plan 08 needed for the
 * attachments of a prompt (B-01) and the fork point of a resume (B-02).
 */
const boundedModel = buildModel(envelope, [
  {
    source: 'commands/bounded.schema.json',
    schema: {
      title: 'Bounded',
      'x-kind': 'command',
      'x-type': 'bounded.do',
      type: 'object',
      'x-required-when': [
        {
          field: 'path',
          when: { field: 'kind', absent: true },
          because: 'an untyped item is the old file item',
        },
        {
          field: 'resumeId',
          when: { field: 'forkAt', present: true },
          because: 'a fork point belongs to a resumed conversation',
        },
      ],
      properties: {
        kind: { type: 'string', enum: ['file', 'text'] },
        path: { type: 'string' },
        forkAt: { type: 'string' },
        resumeId: { type: 'string' },
        items: { type: 'array', maxItems: 20, items: { type: 'string' } },
        pair: { type: 'array', minItems: 2, items: { type: 'string' } },
        label: { type: 'string', maxLength: 200 },
        line: { type: 'integer', minimum: 1 },
      },
    },
  },
]);
const boundedTypeScript = emitTypeScript(boundedModel);
const boundedDart = emitDart(boundedModel);

describe('a presence rule, in both languages', () => {
  it('fires on absence in TypeScript', () => {
    expect(boundedTypeScript).toContain(
      "requiredWhen(record['kind'] === undefined, typeof record['path'] === 'string'),",
    );
  });

  it('fires on presence in TypeScript', () => {
    expect(boundedTypeScript).toContain(
      "requiredWhen(record['forkAt'] !== undefined, typeof record['resumeId'] === 'string'),",
    );
  });

  it('says so in the TypeScript doc comment', () => {
    expect(boundedTypeScript).toContain(
      '`path` is also required when `kind` is absent — an untyped item is the old file item.',
    );
    expect(boundedTypeScript).toContain('`resumeId` is also required when `forkAt` is present');
  });

  it('fires on absence and on presence in Dart', () => {
    expect(boundedDart).toContain("if (json['kind'] == null && json['path'] is! String) {");
    expect(boundedDart).toContain("if (json['forkAt'] != null && json['resumeId'] is! String) {");
  });
});

describe('the bounds of a field, in TypeScript', () => {
  it('checks each bound in the guard, through its helper', () => {
    expect(boundedTypeScript).toContain("    withinMaxItems(record['items'], 20),");
    expect(boundedTypeScript).toContain("    withMinItems(record['pair'], 2),");
    expect(boundedTypeScript).toContain("    withinMaxLength(record['label'], 200),");
    expect(boundedTypeScript).toContain("    atLeast(record['line'], 1),");
  });

  it('emits the helpers that are called, and only those', () => {
    expect(boundedTypeScript).toContain('function withinMaxItems(value: unknown, max: number)');
    expect(typescript).not.toContain('function withinMaxItems(');
    expect(typescript).not.toContain('function atLeast(');
  });

  it('exports the bounds as a constant a validator of its own can read', () => {
    expect(boundedTypeScript).toContain('export const BOUNDED_PAYLOAD_LIMITS = {');
    expect(boundedTypeScript).toContain('  items: { maxItems: 20 },');
    expect(boundedTypeScript).toContain('  pair: { minItems: 2 },');
    expect(boundedTypeScript).toContain('  label: { maxLength: 200 },');
    expect(boundedTypeScript).toContain('  line: { minimum: 1 },');
  });

  it('exports no constant for a declaration with no bound', () => {
    expect(typescript).not.toContain('_LIMITS = {');
  });
});

describe('the bounds of a field, in Dart', () => {
  it('emits a predicate named after the declaration', () => {
    expect(boundedDart).toContain('bool boundedPayloadLimitsHold(Map<String, Object?> json) {');
  });

  it('refuses a list longer or shorter than its bound, a string longer than its bound and a number under it', () => {
    expect(boundedDart).toContain(
      "if (json['items'] is List<Object?> && (json['items']! as List<Object?>).length > 20) {",
    );
    expect(boundedDart).toContain(
      "if (json['pair'] is List<Object?> && (json['pair']! as List<Object?>).length < 2) {",
    );
    expect(boundedDart).toContain(
      "if (json['label'] is String && (json['label']! as String).length > 200) {",
    );
    expect(boundedDart).toContain("if (json['line'] is int && (json['line']! as int) < 1) {");
  });

  it('emits no predicate for a declaration with no bound', () => {
    expect(dart).not.toContain('LimitsHold');
  });
});

/**
 * The emitted helpers, run as the guards run them: a field that is absent or of another shape is
 * the required and shape checks' to refuse, never the bound's.
 */
describe('the bound helpers, at runtime', () => {
  /** @param {string} name */
  const helper = (name) => {
    const source = new RegExp(
      `function ${name}\\(value: unknown, (?:max|min): number\\): boolean \\{\\n  return (.*);\\n\\}`,
    ).exec(boundedTypeScript)?.[1];
    return /** @type {(value: unknown, bound: number) => boolean} */ (
      new Function(
        'value',
        name === 'atLeast' || name === 'withMinItems' ? 'min' : 'max',
        `return ${String(source)};`,
      )
    );
  };

  it.each([
    ['withinMaxItems', ['a', 'b'], 2, true],
    ['withinMaxItems', ['a', 'b', 'c'], 2, false],
    ['withinMaxItems', undefined, 2, true],
    ['withMinItems', ['a', 'b'], 2, true],
    ['withMinItems', ['a'], 2, false],
    ['withMinItems', undefined, 2, true],
    ['withinMaxLength', 'ab', 2, true],
    ['withinMaxLength', 'abc', 2, false],
    ['withinMaxLength', 7, 2, true],
    ['atLeast', 1, 1, true],
    ['atLeast', 0, 1, false],
    ['atLeast', -3, 1, false],
    ['atLeast', 'one', 1, true],
  ])('%s(%j, %d) is %s', (name, value, bound, expected) => {
    expect(helper(name)(value, bound)).toBe(expected);
  });
});
